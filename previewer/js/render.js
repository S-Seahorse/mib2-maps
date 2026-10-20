// Draws the sample city with a MapConfig's colours, widths and zoom ranges.
//
// The map is painted top-down onto one canvas. For the 3D view that canvas is
// larger than the screen and tilted with a CSS perspective transform, which
// keeps roads as ground-level ribbons that narrow into the distance, the way the
// head unit draws them. Labels, markers and the car sit on a second, flat canvas
// so text stays upright, as it does in the car.
//
// How the config is read:
//  - widths and resolutions are fixed-point (value / 256); resolutions are metres per pixel
//  - a road's casing is lanewidth + borderwidth wide in the pen colour, with the
//    fill lanewidth wide in the brush colour on top
//  - a feature is drawn only while the zoom is inside its visibilityconfiguration range
//  - areas use the brush colour only; the head unit does not stroke area edges
// Route and traffic-band shapes are approximations; the colours are exact.
(function (MIB) {
  'use strict';
  const { cssColour, hexToRgba, rgbaToHex } = MIB.util;

  const ROAD_CLASSES = ['footway', 'pedestrianzone', 'restricted_road', 'enclosed_traffic_area_road', 'urbanroad', 'countryroad', 'expressway', 'dualcarriageway', 'motorway'];
  const RAIL_CLASSES = ['tramway', 'subway', 'cartrain', 'railway', 'suburban_train', 'ferry'];
  const AREA_KEYS = { built_up: 'builtup' };
  const SIZE_FALLBACK = { restricted_road: 'urbanroad', enclosed_traffic_area_road: 'urbanroad', suburban_train: 'railway', one_way_street: 'urbanroad' };
  const VIS_FALLBACK = { restricted_road: 'urbanroad', enclosed_traffic_area_road: 'urbanroad' };
  const LABEL_VIS = {
    city_label: 'city_names',
    capital_city_label: 'city_names',
    road_label: 'road_names',
    sea_label: 'polygon_name_ocean',
    island_label: 'polygon_names',
    river_label: 'polygon_name_river',
    polygon_label: 'polygon_name_lake',
    waterway_label: 'polygon_name_canal',
  };
  // Calibrated against img/stock-day.png: city names render about a third
  // larger than their font size; street names at their font size.
  const LABEL_SCALE = { city_label: 1.3, capital_city_label: 1.3 };
  // The head unit's own font when mapstyles/Font is reachable, else Barlow (loaded by the page).
  const FONT_STACK = '"VWTextCarUI", "Barlow", "Segoe UI", system-ui, sans-serif';

  class Renderer {
    constructor(host) {
      this.host = host;
      this.screen = document.createElement('div');
      this.screen.className = 'hu-screen';
      this.sky = document.createElement('div');
      this.sky.className = 'hu-sky';
      this.map = document.createElement('canvas');
      this.map.className = 'hu-map';
      this.fog = document.createElement('div');
      this.fog.className = 'hu-fog';
      this.overlay = document.createElement('canvas');
      this.overlay.className = 'hu-overlay';
      this.screen.append(this.sky, this.map, this.fog, this.overlay);
      host.append(this.screen);
      this.pickCanvas = document.createElement('canvas');
      this.pickDirty = true;
      this.labelBoxes = [];
      this.style = null;
      this.view = null;
      this.fontFamily = FONT_STACK;
      this.sizeCache = new Map();
      this.drawn = new Set();
    }

    // style: { entry(name) -> {pen, brush} | undefined, model, fontDefs, tuning }
    setStyle(style) {
      this.style = style;
      this.sizeCache.clear();
    }

    setView(view) {
      const prev = this.view;
      this.view = view;
      if (!prev || ['res', 'cx', 'cy', 'heading', 'threeD', 'width', 'height', 'screenW', 'screenH', 'route', 'traffic'].some((k) => prev[k] !== view[k])) {
        this.pickDirty = true;
      }
    }

    // ---- config lookups -----------------------------------------------------

    vis(name) {
      const v = this.style.model.visibility.get(name);
      if (!v) return true;
      const r = this.view.res * 256;
      return r >= v.min && r <= v.max;
    }

    areaVisible(cls) {
      return this.vis(`polygon_dc_${AREA_KEYS[cls] || cls}`) && this.vis('polygon');
    }

    lineVisible(cls) {
      return this.vis(`road_dc_${VIS_FALLBACK[cls] || cls}`) && (RAIL_CLASSES.includes(cls) || this.vis('road'));
    }

    size(cls) {
      if (this.sizeCache.has(cls)) return this.sizeCache.get(cls);
      const rows = this.style.model.sizes.get(cls) || this.style.model.sizes.get(SIZE_FALLBACK[cls]) || this.style.model.sizes.get('urbanroad');
      const r = this.view.res * 256;
      let pick = rows[0];
      for (const row of rows) if (row.resolution <= r) pick = row;
      const out = pick || { lane: 2, border: 0, highlight: 3 };
      this.sizeCache.set(cls, out);
      return out;
    }

    tuning(name, fallback) {
      const v = this.style.tuning(name);
      return v == null ? fallback : +v / 256;
    }

    // The head unit multiplies every colour by the display tuning factors.
    tune(hex) {
      const rf = this.tuning('color_red_factor', 1);
      const gf = this.tuning('color_green_factor', 1);
      const bf = this.tuning('color_blue_factor', 1);
      const sf = this.tuning('color_saturation_factor', 1);
      if (rf === 1 && gf === 1 && bf === 1 && sf === 1) return hex;
      let { r, g, b, a } = hexToRgba(hex);
      r *= rf;
      g *= gf;
      b *= bf;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sf;
      g = l + (g - l) * sf;
      b = l + (b - l) * sf;
      return rgbaToHex({ r, g, b, a });
    }

    // CSS colour for an entry's slot, or null when the style hides it.
    colour(name, slot) {
      const e = this.style.entry(name);
      if (!e || !e[slot] || e[slot].style === 'transparent') return null;
      const c = this.tune(e[slot].color);
      if (hexToRgba(c).a === 0) return null;
      if (this.picking) return this.pickColour(name);
      this.drawn.add(name);
      return cssColour(c);
    }

    slotStyle(name, slot) {
      const e = this.style.entry(name);
      return e && e[slot] ? e[slot].style : 'transparent';
    }

    pickColour(name) {
      if (!this.pickIds.has(name)) {
        const id = this.pickIds.size + 1;
        this.pickIds.set(name, id);
        this.pickNames.set(id, name);
      }
      const id = this.pickIds.get(name) * 997; // spread ids so neighbours differ a lot
      return `rgb(${(id >> 16) & 255},${(id >> 8) & 255},${id & 255})`;
    }

    // ---- layout -------------------------------------------------------------

    layout() {
      const v = this.view;
      const Dw = this.host.clientWidth;
      const Dh = Math.round((Dw * v.screenH) / v.screenW);
      this.screen.style.height = `${Dh}px`;
      const s = Dw / v.screenW; // css px per head-unit px
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const L = { Dw, Dh, s, dpr };

      if (v.threeD) {
        // The camera looks down at 52° from vertical (the zoom table's tilt is
        // 34° above the horizon). The map canvas ends a little below the
        // horizon; haze covers the rest, as the head unit's far plane does.
        const theta = (52 * Math.PI) / 180;
        const Fy = 0.78 * Dh; // where the car sits on screen
        const Yh = 0.06 * Dh; // horizon
        const P = (Fy - Yh) * Math.tan(theta);
        const vAt = (Y) => {
          const dy = Y - Fy;
          return (dy * P) / (P * Math.cos(theta) + dy * Math.sin(theta));
        };
        const Ytop = Yh + 0.15 * Dh;
        const vTop = vAt(Ytop);
        const vBot = vAt(Dh) + 4;
        const scaleTop = P / (P - vTop * Math.sin(theta));
        const Wm = Math.ceil(Dw / scaleTop + 40);
        const Hm = Math.ceil(vBot - vTop);
        Object.assign(L, { theta, P, Fy, Yh, Ytop, Wm, Hm, fx: Wm / 2, fy: -vTop, ox: Dw / 2, oy: Fy });
        L.bs = Math.max(0.5, Math.min(dpr, Math.sqrt(1.1e7 / (Wm * Hm))));
        Object.assign(this.map.style, {
          width: `${Wm}px`,
          height: `${Hm}px`,
          left: `${Dw / 2 - Wm / 2}px`,
          top: `${Fy + vTop}px`,
          transformOrigin: `${Wm / 2}px ${-vTop}px`,
          transform: `perspective(${P}px) rotateX(${theta}rad)`,
        });
      } else {
        Object.assign(L, { Wm: Dw, Hm: Dh, fx: Dw / 2, fy: 0.62 * Dh, bs: dpr });
        Object.assign(this.map.style, { width: `${Dw}px`, height: `${Dh}px`, left: '0px', top: '0px', transform: 'none' });
      }
      const bw = Math.round(L.Wm * L.bs);
      const bh = Math.round(L.Hm * L.bs);
      if (this.map.width !== bw || this.map.height !== bh) {
        this.map.width = bw;
        this.map.height = bh;
      }
      const ow = Math.round(Dw * dpr);
      const oh = Math.round(Dh * dpr);
      if (this.overlay.width !== ow || this.overlay.height !== oh) {
        this.overlay.width = ow;
        this.overlay.height = oh;
      }
      Object.assign(this.overlay.style, { width: `${Dw}px`, height: `${Dh}px` });
      this.L = L;
      // world -> map canvas css px
      const k = s / v.res;
      const a = Math.PI / 2 - v.heading;
      this.T = { k, ca: Math.cos(a), sa: Math.sin(a) };
    }

    toCanvas(x, y) {
      const { k, ca, sa } = this.T;
      const dx = x - this.view.cx;
      const dy = y - this.view.cy;
      return [this.L.fx + k * (ca * dx - sa * dy), this.L.fy - k * (sa * dx + ca * dy)];
    }

    fromCanvas(px, py) {
      const { k, ca, sa } = this.T;
      const dx = (px - this.L.fx) / k;
      const dy = -(py - this.L.fy) / k;
      return [this.view.cx + ca * dx + sa * dy, this.view.cy - sa * dx + ca * dy];
    }

    // map canvas css px -> screen css px (applies the 3D tilt)
    toScreen(px, py) {
      const L = this.L;
      if (!this.view.threeD) return [px, py, 1];
      const u = px - L.fx;
      const v = py - L.fy;
      const w = L.P / (L.P - v * Math.sin(L.theta));
      return [L.ox + u * w, L.oy + v * Math.cos(L.theta) * w, w];
    }

    fromScreen(X, Y) {
      const L = this.L;
      if (!this.view.threeD) return [X, Y];
      const dx = X - L.ox;
      const dy = Y - L.oy;
      const v = (dy * L.P) / (L.P * Math.cos(L.theta) + dy * Math.sin(L.theta));
      const u = (dx * (L.P - v * Math.sin(L.theta))) / L.P;
      return [u + L.fx, v + L.fy];
    }

    // ---- drawing ------------------------------------------------------------

    render() {
      if (!this.style || !this.view) return;
      this.layout();
      this.picking = false;
      this.drawn = new Set();
      this.sizeCache.clear();
      const ctx = this.map.getContext('2d');
      this.paintMap(ctx, this.L.bs);
      this.paintSky();
      this.paintOverlay();
      this.pickDirty = true;
    }

    worldTransform(ctx, scale) {
      const { k, ca, sa } = this.T;
      const kk = k * scale;
      const e = this.L.fx * scale;
      const f = this.L.fy * scale;
      const { cx, cy } = this.view;
      // x' = kk*(ca*(x-cx) - sa*(y-cy)) + e ; y' = -kk*(sa*(x-cx) + ca*(y-cy)) + f
      ctx.setTransform(kk * ca, -kk * sa, -kk * sa, -kk * ca, e - kk * (ca * cx - sa * cy), f + kk * (sa * cx + ca * cy));
    }

    viewBox() {
      const L = this.L;
      const pts = [this.fromCanvas(0, 0), this.fromCanvas(L.Wm, 0), this.fromCanvas(0, L.Hm), this.fromCanvas(L.Wm, L.Hm)];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const pad = 60 * this.view.res;
      return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    }

    inView(box) {
      const b = this.vb;
      return !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]);
    }

    paintMap(ctx, scale) {
      const scene = MIB.scene;
      const res = this.view.res;
      this.vb = this.viewBox();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Land: map background, then the terrain colour map.
      const land = this.colour('map_background', 'brush') || '#808080';
      ctx.fillStyle = land;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (!this.picking && this.vis('dtm')) this.paintTerrain(ctx, scale);

      this.worldTransform(ctx, scale);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Areas, in the order the scene lists them.
      let i = 0;
      const areas = scene.areas;
      while (i < areas.length) {
        const cls = areas[i].cls;
        let j = i;
        ctx.beginPath();
        let any = false;
        while (j < areas.length && areas[j].cls === cls) {
          const a = areas[j];
          if (this.inView(a.box)) {
            this.ringPath(ctx, a.ring);
            any = true;
          }
          j++;
        }
        const fill = any && this.areaVisible(cls) ? this.colour(cls, 'brush') : null;
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill('evenodd');
        }
        i = j;
      }

      // Buildings: 3D city models up close in the 3D view, flat footprints otherwise.
      if (this.areaVisible('building')) {
        const name = this.view.threeD && this.vis('city_buildings') ? 'city_models' : 'building';
        const fill = this.colour(name, 'brush');
        if (fill) {
          ctx.beginPath();
          for (const b of scene.buildings) if (this.inView(b.box)) this.ringPath(ctx, b.ring);
          ctx.fillStyle = fill;
          ctx.fill();
          if (name === 'city_models' && !this.picking) {
            const edge = this.colour('city_models', 'pen');
            if (edge) {
              ctx.strokeStyle = edge;
              ctx.lineWidth = res * 1.2;
              ctx.stroke();
            }
          }
        }
      }

      const lines = scene.lines.filter((l) => this.inView(l.box));
      const byCls = (cls) => lines.filter((l) => l.cls === cls);

      // Creeks.
      if (this.lineVisible('waterway')) {
        const c = this.colour('waterway', 'brush');
        if (c) this.strokeAll(ctx, byCls('waterway'), c, this.size('waterway').lane * res);
      }

      // Rail and ferry, under the roads.
      for (const cls of RAIL_CLASSES) {
        if (!this.lineVisible(cls)) continue;
        this.paintRail(ctx, cls, byCls(cls));
      }

      // Tunnels go under everything else.
      for (const cls of ROAD_CLASSES) {
        if (!this.lineVisible(cls)) continue;
        const parts = this.partsOf(byCls(cls), 'tunnels');
        if (parts.length) this.paintRoad(ctx, `${cls}_tunnel`, cls, parts);
      }

      // Traffic-event bands sit under the road they belong to.
      if (this.view.traffic && this.vis('tti') && this.vis('tti_edge_highlighting')) {
        for (const ev of scene.events) {
          if (!this.inView(ev.box) || !this.lineVisible(ev.cls)) continue;
          const name = this.eventName(ev);
          const c = this.colour(name, 'pen');
          if (!c) continue;
          const factor = this.tuning(ev.side === 'off_route' ? 'highlight_width_off_route_factor' : 'highlight_width_on_route_factor', 1);
          this.strokeAll(ctx, [{ pts: ev.pts }], c, this.size(ev.cls).highlight * factor * res + 4 * res);
        }
      }

      // Roads, least important first, so major roads win at junctions.
      for (const cls of ROAD_CLASSES) {
        if (!this.lineVisible(cls)) continue;
        const feats = byCls(cls);
        if (!feats.length) continue;
        this.paintRoad(ctx, cls, cls, this.openParts(feats));
        const tolls = this.partsOf(feats, 'tolls');
        if (tolls.length) this.paintRoad(ctx, `${cls}_toll`, cls, tolls);
        const seasonal = this.partsOf(feats, 'seasonal');
        if (seasonal.length) this.paintRoad(ctx, `${cls}_seasonally_restricted`, cls, seasonal);
      }

      // Bridges on top: the deck, then the road in its bridge colours.
      for (const cls of ROAD_CLASSES) {
        if (!this.lineVisible(cls)) continue;
        const parts = this.partsOf(byCls(cls), 'bridges');
        if (!parts.length) continue;
        const sz = this.size(cls);
        const deck = this.colour('bridge', 'brush');
        if (deck) this.strokeAll(ctx, parts, deck, (sz.lane + sz.border + 3) * res, 'butt');
        this.paintRoad(ctx, `${cls}_bridge`, cls, parts);
      }

      // One-way arrows on the little streets.
      if (this.vis('one_way_street_arrow') && this.lineVisible('urbanroad')) this.paintOneWay(ctx, lines.filter((l) => l.oneway));

      // Traffic flow lines along the motorways.
      if (this.view.traffic && this.vis('tti')) {
        for (const f of scene.flow) {
          if (!this.inView(f.box) || !this.vis(`road_sf_${f.cls}`) || !this.lineVisible(f.cls)) continue;
          const c = this.colour(f.kind, 'brush');
          if (!c) continue;
          const sz = this.size(f.cls);
          const parts = [{ pts: MIB.scene.helpers.offsetLine(f.pts, f.dual) }, { pts: MIB.scene.helpers.offsetLine(f.pts, -f.dual) }];
          this.strokeAll(ctx, parts, c, Math.max(1.5, sz.lane * 0.55) * res);
        }
      }

      // The route.
      if (this.view.route && this.vis('route')) {
        const type = this.view.routeType || 'fast';
        const sz = this.size('dualcarriageway');
        const factor = this.tuning('highlight_width_on_route_factor', 1);
        const w = (Math.max(sz.highlight * factor, 6) + 2) * res;
        for (const leg of MIB.scene.route) {
          if (!this.inView(leg.box)) continue;
          const name = `route_${type}_active_subtour_${leg.leg}`;
          const line = this.colour(name, 'pen');
          const core = this.colour(name, 'brush');
          if (line) this.strokeAll(ctx, [leg], line, w);
          if (core) this.strokeAll(ctx, [leg], core, w * 0.4);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    ringPath(ctx, ring) {
      ctx.moveTo(ring[0], ring[1]);
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
      ctx.closePath();
    }

    linePath(ctx, pts) {
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    }

    strokeAll(ctx, feats, colour, width, cap) {
      if (!feats.length || width <= 0) return;
      ctx.beginPath();
      for (const f of feats) this.linePath(ctx, f.pts);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.lineCap = cap || 'round';
      ctx.stroke();
      ctx.lineCap = 'round';
    }

    // Splits features into carriageways and the sections listed in `key`.
    partsOf(feats, key) {
      const out = [];
      const { slice, offsetLine } = MIB.scene.helpers;
      for (const f of feats) {
        const spans = f[key];
        if (!spans || !spans.length) continue;
        for (const [a, b] of spans) {
          const pts = slice(f.pts, a, b);
          if (pts.length < 4) continue;
          if (f.dual) out.push({ pts: offsetLine(pts, f.dual) }, { pts: offsetLine(pts, -f.dual) });
          else out.push({ pts });
        }
      }
      return out;
    }

    // Everything except tunnels (bridges are drawn over the top later).
    openParts(feats) {
      const out = [];
      const { slice } = MIB.scene.helpers;
      for (const f of feats) {
        if (!f._open) {
          const cuts = (f.tunnels || []).slice().sort((x, y) => x[0] - y[0]);
          const spans = [];
          let at = 0;
          for (const [a, b] of cuts) {
            if (a > at) spans.push([at, a]);
            at = b;
          }
          if (at < 1) spans.push([at, 1]);
          f._open = spans.map(([a, b]) => (a === 0 && b === 1 ? f.pts : slice(f.pts, a, b)));
          if (f.dual) {
            const { offsetLine } = MIB.scene.helpers;
            f._open = f._open.flatMap((pts) => [offsetLine(pts, f.dual), offsetLine(pts, -f.dual)]);
          }
        }
        for (const pts of f._open) out.push({ pts });
      }
      return out;
    }

    paintRoad(ctx, name, cls, parts) {
      const res = this.view.res;
      const sz = this.size(cls);
      const casing = sz.border > 0 && this.slotStyle(name, 'pen') === 'solid' ? this.colour(name, 'pen') : null;
      const fill = this.colour(name, 'brush');
      if (casing) this.strokeAll(ctx, parts, casing, (sz.lane + sz.border) * res);
      if (fill) this.strokeAll(ctx, parts, fill, Math.max(sz.lane, 0.6) * res);
    }

    paintRail(ctx, cls, feats) {
      if (!feats.length) return;
      const res = this.view.res;
      const sz = this.size(cls);
      const w = Math.max(sz.lane, 1) * res;
      const penStyle = this.slotStyle(cls, 'pen');
      const pen = this.colour(cls, 'pen');
      const brush = this.colour(cls, 'brush');
      const entry = this.style.entry(cls);
      const pattern = entry && entry.pattern != null ? this.style.model.patterns.get(entry.pattern) : null;
      if (cls === 'ferry') {
        // Ferries are drawn as dashes only.
        if (!pen) return;
        ctx.setLineDash([6 * res, 6 * res]);
        this.strokeAll(ctx, feats, pen, w * 0.6, 'butt');
        ctx.setLineDash([]);
        return;
      }
      if (brush) this.strokeAll(ctx, feats, brush, w);
      if (pen && penStyle === 'pattern') {
        const p = pattern || { scale: 20, stroke: 9 };
        ctx.setLineDash([(p.stroke / 2) * res, ((p.scale - p.stroke) / 2) * res]);
        this.strokeAll(ctx, feats, pen, w * 0.55, 'butt');
        ctx.setLineDash([]);
      }
    }

    paintOneWay(ctx, feats) {
      const res = this.view.res;
      const fill = this.colour('one_way_arrows', 'brush');
      if (!fill) return;
      const { along, lineLength } = MIB.scene.helpers;
      const step = 120 * res;
      const len = 7 * res;
      ctx.beginPath();
      for (const f of feats) {
        const total = lineLength(f.pts);
        for (let d = step / 2; d < total; d += step) {
          const p = along(f.pts, d / total);
          const a = p.angle + (f.oneway < 0 ? Math.PI : 0);
          const c = Math.cos(a);
          const s = Math.sin(a);
          ctx.moveTo(p.x + c * len, p.y + s * len);
          ctx.lineTo(p.x - c * len - s * len * 0.7, p.y - s * len + c * len * 0.7);
          ctx.lineTo(p.x - c * len + s * len * 0.7, p.y - s * len - c * len * 0.7);
          ctx.closePath();
        }
      }
      ctx.fillStyle = fill;
      ctx.fill();
    }

    eventName(ev) {
      const name = `tmc_${ev.event}_${ev.side}`;
      return this.style.entry(name) ? name : `tmc_default_${ev.side}`;
    }

    // Terrain colours by height, for configs whose colour map varies at this zoom.
    paintTerrain(ctx, scale) {
      const r = this.view.res * 256;
      const dtm = this.style.dtm();
      if (!dtm.length) return;
      let bucket = -1;
      for (const d of dtm) if (d.resolution <= r && d.resolution > bucket) bucket = d.resolution;
      if (bucket < 0) bucket = Math.min(...dtm.map((d) => d.resolution));
      const stops = dtm.filter((d) => d.resolution === bucket).sort((a, b) => a.height - b.height);
      if (!stops.length) return;
      const colourAt = (h) => {
        if (h <= stops[0].height) return stops[0].color;
        for (let i = 1; i < stops.length; i++) {
          if (h <= stops[i].height) {
            const a = hexToRgba(stops[i - 1].color);
            const b = hexToRgba(stops[i].color);
            const t = (h - stops[i - 1].height) / (stops[i].height - stops[i - 1].height || 1);
            return rgbaToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t });
          }
        }
        return stops[stops.length - 1].color;
      };
      const uniform = stops.every((s) => s.color === stops[0].color);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (uniform) {
        ctx.fillStyle = cssColour(this.tune(stops[0].color));
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }
      const cell = 12;
      const cw = Math.ceil(this.L.Wm / cell);
      const ch = Math.ceil(this.L.Hm / cell);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const [wx, wy] = this.fromCanvas((x + 0.5) * cell, (y + 0.5) * cell);
          ctx.fillStyle = cssColour(this.tune(colourAt(MIB.scene.height(wx, wy))));
          ctx.fillRect(x * cell * scale, y * cell * scale, cell * scale + 1, cell * scale + 1);
        }
      }
    }

    paintSky() {
      if (!this.view.threeD) {
        this.sky.hidden = true;
        this.fog.hidden = true;
        this.screen.style.background = this.colour('map_background', 'brush') || '#000';
        return;
      }
      const sky = this.colour('sky_background', 'pen') || '#7d93a8';
      const haze = this.colour('fog', 'pen') || sky;
      const L = this.L;
      const h = (y) => `${((y / L.Dh) * 100).toFixed(2)}%`;
      this.sky.hidden = false;
      this.fog.hidden = false;
      this.sky.style.background = `linear-gradient(to bottom, ${sky} 0%, ${haze} ${h(L.Yh + 2)}, ${haze} 100%)`;
      this.fog.style.background = `linear-gradient(to bottom, ${haze} ${h(L.Ytop + 3)}, transparent ${h(L.Ytop + 0.14 * L.Dh)})`;
      this.screen.style.background = haze;
    }

    // ---- labels, markers and the car ---------------------------------------

    fontFor(kind, big) {
      const model = this.style.model;
      const fonts = model.fonts.filter((f) => f.type === kind);
      const pick = fonts.length > 1 ? fonts.reduce((a, b) => ((a.size || 0) > (b.size || 0) === !!big ? a : b)) : fonts[0];
      const def = pick && this.style.fontDefs ? this.style.fontDefs.get(pick.id) : null;
      const size = def ? def.size : kind.includes('city') ? 28 : 20;
      const face = def ? def.face : '';
      const weight = /bold|semibold/i.test(face) ? 600 : /light/i.test(face) ? 300 : 400;
      return { size: size * (LABEL_SCALE[kind] || 1), weight, outline: pick ? pick.outline : 1 };
    }

    paintOverlay() {
      const ctx = this.overlay.getContext('2d');
      const L = this.L;
      ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      ctx.clearRect(0, 0, L.Dw, L.Dh);
      this.labelBoxes = [];
      const scene = MIB.scene;
      const s = L.s;
      // Keep labels off the status bar, compass and zoom box.
      const placed = [
        [0, 0, L.Dw, L.Dh * 0.08],
        [L.Dw * 0.89, L.Dh * 0.1, L.Dw, L.Dh * 0.3],
        [L.Dw * 0.89, L.Dh * 0.8, L.Dw, L.Dh],
      ];
      const minY = this.view.threeD ? L.Ytop + 0.05 * L.Dh : -Infinity;

      const project = (x, y) => {
        const [px, py] = this.toCanvas(x, y);
        return this.toScreen(px, py);
      };
      const onScreen = (X, Y, m = 0) => X > -m && X < L.Dw + m && Y > Math.max(-m, minY) && Y < L.Dh + m;

      const drawLabel = (kind, text, X, Y, opts = {}) => {
        const font = this.fontFor(kind, opts.big);
        // Labels shrink only a little with distance (the config's near/far
        // label scale factors differ by about 15%).
        const depth = this.view.threeD ? 0.85 + 0.15 * Math.max(0, Math.min(1, ((opts.w || 1) - 0.3) / 0.7)) : 1;
        const px = font.size * s * depth;
        ctx.font = `${font.weight} ${px.toFixed(1)}px ${this.fontFamily}`;
        const w = ctx.measureText(text).width;
        const box = [X - w / 2 - 3, Y - px * 0.8, X + w / 2 + 3, Y + px * 0.3];
        if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
        placed.push(box);
        this.labelBoxes.push({ box, name: kind });
        const halo = this.colour(kind, 'pen');
        const fill = this.colour(kind, 'brush');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        if (halo && font.outline > 0) {
          ctx.strokeStyle = halo;
          ctx.lineWidth = Math.max(2, font.outline * 1.5) * s * 1.6;
          ctx.strokeText(text, X, Y);
        }
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillText(text, X, Y);
        }
        return true;
      };

      // The car, the stopover and the destination come first so labels avoid them.
      const marker = (x, y, draw, size) => {
        const [X, Y] = project(x, y);
        if (!onScreen(X, Y, 20)) return null;
        placed.push([X - size, Y - size, X + size, Y + size]);
        draw(X, Y);
        return [X, Y];
      };
      if (this.vis('vehicle')) {
        marker(scene.vehicle.x, scene.vehicle.y, (X, Y) => this.drawCar(ctx, X, Y, 15 * s * 1.6), 16 * s * 1.6);
      }
      if (this.view.route && this.vis('route')) {
        const type = this.view.routeType || 'fast';
        const stop = `route_${type}_waypoint_route_manual_marker`;
        marker(scene.stopover.x, scene.stopover.y, (X, Y) => this.drawStop(ctx, X, Y, 9 * s * 1.6, stop), 12 * s * 1.6);
        if (this.vis('destination')) marker(scene.destination.x, scene.destination.y, (X, Y) => this.drawFlag(ctx, X, Y, 14 * s * 1.6), 16 * s * 1.6);
      }

      if (!this.view.labels) return;
      const candidates = [];
      for (const l of scene.labels) {
        if (!this.vis(LABEL_VIS[l.kind] || 'polygon_names')) continue;
        const [X, Y, w] = project(l.x, l.y);
        if (onScreen(X, Y, 40)) candidates.push({ rank: l.rank, kind: l.kind, text: l.text, X, Y, w, city: /city/.test(l.kind) });
      }
      if (this.vis('road_names')) {
        const { along } = scene.helpers;
        for (const r of scene.roadNames) {
          if (!this.lineVisible(r.cls)) continue;
          const major = ['motorway', 'dualcarriageway', 'expressway'].includes(r.cls);
          for (let i = 0; i < r.repeat; i++) {
            const p = along(r.line, (i + 0.5) / r.repeat);
            const [X, Y, w] = project(p.x, p.y);
            if (onScreen(X, Y, -10)) candidates.push({ rank: major ? 3 : 6, kind: 'road_label', text: r.name, X, Y, w, big: major });
          }
        }
      }
      candidates.sort((a, b) => a.rank - b.rank || b.Y - a.Y);
      for (const c of candidates) {
        const ok = drawLabel(c.kind, c.text, c.X, c.Y, { w: c.w, big: c.big || c.city });
        if (ok && c.city && this.vis('city_marker')) {
          const fill = this.colour(c.kind, 'brush');
          const halo = this.colour(c.kind, 'pen');
          if (fill) {
            const r = 3.2 * s * 1.6;
            const y = c.Y + r + 3 * s;
            ctx.beginPath();
            ctx.arc(c.X, y, r, 0, Math.PI * 2);
            ctx.fillStyle = halo || '#fff';
            ctx.fill();
            ctx.lineWidth = 1.6 * s * 1.6;
            ctx.strokeStyle = fill;
            ctx.stroke();
          }
        }
      }
    }

    drawCar(ctx, X, Y, r) {
      ctx.save();
      ctx.translate(X, Y);
      if (this.view.threeD) ctx.scale(1, 0.62);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.72, r * 0.8);
      ctx.lineTo(0, r * 0.42);
      ctx.lineTo(-r * 0.72, r * 0.8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.translate(1.5, 2.5);
      ctx.fill();
      ctx.translate(-1.5, -2.5);
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0, '#f4f6f8');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(0.51, '#c9d1d8');
      g.addColorStop(1, '#b7c0c8');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#4a5560';
      ctx.stroke();
      ctx.restore();
    }

    drawStop(ctx, X, Y, r, name) {
      const ring = this.colour(name, 'pen') || '#fff';
      const fill = this.colour(name, 'brush') || '#e33';
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = r * 0.35;
      ctx.strokeStyle = ring;
      ctx.stroke();
      this.labelBoxes.push({ box: [X - r, Y - r, X + r, Y + r], name });
    }

    drawFlag(ctx, X, Y, h) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, h * 0.12);
      ctx.strokeStyle = '#2b2f33';
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X, Y - h * 1.6);
      ctx.stroke();
      const sq = h * 0.28;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#1d2124' : '#ffffff';
          ctx.fillRect(X + c * sq, Y - h * 1.6 + r * sq, sq, sq);
        }
      }
      ctx.strokeRect(X, Y - h * 1.6, sq * 3, sq * 3);
      ctx.restore();
    }

    // ---- picking ------------------------------------------------------------

    // Returns the colour entry drawn at a point on the screen (css px), if any.
    pick(X, Y) {
      if (!this.L) return null;
      for (let i = this.labelBoxes.length - 1; i >= 0; i--) {
        const b = this.labelBoxes[i].box;
        if (X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3]) return this.labelBoxes[i].name;
      }
      if (this.view.threeD) {
        if (Y < this.L.Yh + 2) return 'sky_background';
        if (Y < this.L.Ytop + 4) return 'fog';
      }
      const scale = 0.5;
      if (this.pickDirty) {
        this.pickCanvas.width = Math.ceil(this.L.Wm * scale);
        this.pickCanvas.height = Math.ceil(this.L.Hm * scale);
        this.pickIds = new Map();
        this.pickNames = new Map();
        this.picking = true;
        this.sizeCache.clear();
        const pctx = this.pickCanvas.getContext('2d', { willReadFrequently: true });
        this.paintMap(pctx, scale);
        this.picking = false;
        this.pickDirty = false;
      }
      const [px, py] = this.fromScreen(X, Y);
      const x = Math.floor(px * scale);
      const y = Math.floor(py * scale);
      if (x < 0 || y < 0 || x >= this.pickCanvas.width || y >= this.pickCanvas.height) return null;
      // Edges are anti-aliased into colours that match no id, so take the
      // nearest exact match in a small window around the point.
      const R = 3;
      const x0 = Math.max(0, x - R);
      const y0 = Math.max(0, y - R);
      const w = Math.min(this.pickCanvas.width, x + R + 1) - x0;
      const h = Math.min(this.pickCanvas.height, y + R + 1) - y0;
      const d = this.pickCanvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
      let best = null;
      let bestDist = Infinity;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const o = (j * w + i) * 4;
          const name = this.pickNames.get(((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]) / 997);
          const dist = (x0 + i - x) ** 2 + (y0 + j - y) ** 2;
          if (name && dist < bestDist) {
            best = name;
            bestDist = dist;
          }
        }
      }
      return best;
    }
  }

  MIB.Renderer = Renderer;
})((window.MIB = window.MIB || {}));
