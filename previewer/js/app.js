// Boots the previewer: loads the stock MapConfigs from mapstyles/, wires the
// toolbar, keeps edits (with undo), and exports a ready-to-copy MapConfigs folder.
(function (MIB) {
  'use strict';
  const { el, store, gunzipIfNeeded, decodeText, encodeText, makeZip, saveFile, gzip, canGzip, normaliseHex } = MIB.util;
  const { sameSlot } = MIB.editorHelpers;

  const STOCK_FILES = [
    'MapConfigs/1280x640/mapconfig_default_0_DTM.mxf.gz',
    'MapConfigs/1280x640/mapconfig_default_1_DTM.mxf.gz',
    'MapConfigs/1280x640/mapconfig_default_kombi_0.mxf.gz',
    'MapConfigs/1280x640/mapconfig_default_kombi_1.mxf.gz',
    'MapConfigs/1280x640/mapconfig_traffic_kombi_0.mxf.gz',
    'MapConfigs/1280x640/mapconfig_traffic_kombi_1.mxf.gz',
    'MapConfigs/mapconfig_default_0_DTM.mxf.gz',
    'MapConfigs/mapconfig_default_1_DTM.mxf.gz',
    'MapConfigs/mapconfig_default_kombi_0.mxf.gz',
    'MapConfigs/mapconfig_default_kombi_1.mxf.gz',
    'MapConfigs/mapconfig_traffic_kombi_0.mxf.gz',
    'MapConfigs/mapconfig_traffic_kombi_1.mxf.gz',
  ];
  // The page lives in previewer/, next to mapstyles/. A copy hosted elsewhere
  // can say where its mapstyles/ folder is with window.MIB_MAPSTYLES.
  const BASES = window.MIB_MAPSTYLES ? [window.MIB_MAPSTYLES] : ['../mapstyles/', 'mapstyles/'];
  const STORE_KEY = 'mib2-style-lab:v1:';

  // Metric zoom steps from pcconfig/zoomlevel_instance0.xml, used if that file can't be loaded.
  const FALLBACK_ZOOM = [
    [30, 0.35], [50, 0.59], [75, 0.88], [100, 1.17], [150, 1.75], [200, 2.33], [300, 3.49], [400, 4.66], [500, 5.82],
    [750, 8.73], [1000, 11.63], [1500, 17.45], [2000, 23.26], [3000, 34.89], [4000, 46.52], [5000, 58.14],
  ].map(([metres, resolution]) => ({ metres, resolution }));
  const MAX_PREVIEW_RES = 24; // up to the 2 km step; further out the sample city runs out

  const SCREENS = { '1280x640': [1280, 640], '800x480': [800, 480] };

  const emptyEdits = () => ({ entries: {}, dtm: {}, tuning: {} });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const state = {
    files: [], // { path, name, mode, model, gz }
    fontDefs: null,
    zoom: FALLBACK_ZOOM,
    source: 'stock',
    mode: 'day',
    screen: '1280x640',
    edits: { day: emptyEdits(), night: emptyEdits() },
    history: [],
    future: [],
    pending: null,
    compare: false,
    view: {
      zoomIndex: 5,
      threeD: true,
      route: true,
      traffic: true,
      labels: true,
      routeType: 'fast',
      cx: 0,
      cy: 0,
      heading: Math.PI / 2,
    },
  };

  let renderer;
  let editor;
  const groupCache = new WeakMap();
  const $ = (sel) => document.querySelector(sel);

  // ---- files ----------------------------------------------------------------

  async function fetchBytes(path) {
    for (const base of BASES) {
      try {
        const res = await fetch(base + path, { cache: 'no-cache' });
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length) continue;
        return await gunzipIfNeeded(bytes);
      } catch (_) {
        /* try the next location */
      }
    }
    return null;
  }

  async function loadStock() {
    // Browsers don't let a page opened from disk read neighbouring files.
    if (location.protocol === 'file:') return [];
    const loaded = await Promise.all(STOCK_FILES.map(async (path) => ({ path, bytes: await fetchBytes(path) })));
    const files = [];
    for (const { path, bytes } of loaded) {
      if (!bytes) continue;
      try {
        const name = path.split('/').pop();
        files.push({ path: path.replace(/\.gz$/, ''), name: name.replace(/\.gz$/, ''), mode: MIB.mxf.modeFromName(name), model: MIB.mxf.parse(decodeText(bytes), name), gz: true });
      } catch (err) {
        console.warn(err);
      }
    }
    const [fcx, zoom] = await Promise.all([fetchBytes('MapConfigs/fontconfig_default_0.fcx'), fetchBytes('pcconfig/zoomlevel_instance0.xml.gz')]);
    if (fcx) state.fontDefs = MIB.mxf.parseFontConfig(decodeText(fcx));
    if (zoom) {
      const levels = MIB.mxf.parseZoomLevels(decodeText(zoom));
      if (levels.length) state.zoom = levels;
    }
    return files;
  }

  async function openFiles(list) {
    const files = [];
    const problems = [];
    for (const file of list) {
      try {
        const bytes = await gunzipIfNeeded(new Uint8Array(await file.arrayBuffer()));
        const text = decodeText(bytes);
        if (/\.fcx$/i.test(file.name) || /<xmlfontconfig/.test(text.slice(0, 400))) {
          state.fontDefs = MIB.mxf.parseFontConfig(text);
          continue;
        }
        const name = file.name.replace(/\.gz$/i, '');
        const model = MIB.mxf.parse(text, file.name);
        const rel = (file.webkitRelativePath || '').replace(/\.gz$/i, '');
        // Without a folder path, tell the screen sizes apart by their label
        // fonts: 1280x640 configs use the large font ids (100 and up).
        const city = model.fonts.find((f) => f.type === 'city_label');
        const hr = rel ? /1280x640/.test(rel) : !!(city && city.id >= 100);
        const path = rel && rel.includes('MapConfigs') ? rel.slice(rel.indexOf('MapConfigs')) : `MapConfigs/${hr ? '1280x640/' : ''}${name}`;
        if (files.some((f) => f.path === path)) {
          problems.push(`${file.name} was opened twice; the first copy is used.`);
          continue;
        }
        files.push({ path, name, mode: MIB.mxf.modeFromName(name) || state.mode, model, gz: /\.gz$/i.test(file.name) });
      } catch (err) {
        problems.push(err.message || `${file.name} could not be read.`);
      }
    }
    if (!files.length) {
      toast(problems[0] || 'No MapConfig files found. Choose .mxf or .mxf.gz files from a MapConfigs folder.', true);
      return;
    }
    commitPending();
    $('.stage').classList.remove('is-empty');
    state.files = files;
    state.source = `custom:${files.map((f) => f.path).sort().join('|')}`;
    restoreEdits();
    pickAvailableMode();
    afterSourceChange();
    toast(`Opened ${files.length} ${files.length === 1 ? 'file' : 'files'}${problems.length ? `. ${problems.length} could not be read` : ''}.`);
  }

  function pickAvailableMode() {
    if (!state.files.some((f) => f.mode === state.mode)) state.mode = state.files[0].mode;
    const hasHr = state.files.some((f) => /1280x640/.test(f.path));
    const hasStd = state.files.some((f) => !/1280x640/.test(f.path));
    if (state.screen === '1280x640' && !hasHr && hasStd) state.screen = '800x480';
    if (state.screen === '800x480' && !hasStd && hasHr) state.screen = '1280x640';
  }

  function primary(mode = state.mode) {
    const ofMode = state.files.filter((f) => f.mode === mode);
    const hr = (f) => /1280x640/.test(f.path);
    const pref = ofMode.filter((f) => (state.screen === '1280x640' ? hr(f) : !hr(f)));
    const pool = pref.length ? pref : ofMode;
    const f = pool.find((x) => /default_[01]_DTM/i.test(x.name)) || pool[0];
    return f ? f.model : null;
  }

  // ---- edits ----------------------------------------------------------------

  const edits = () => state.edits[state.mode];

  function entry(name) {
    const model = primary();
    const base = model.entries.get(name);
    if (state.compare) return base;
    const e = edits().entries[name];
    if (!e) return base;
    return { name, pattern: base ? base.pattern : null, pen: e.pen || base.pen, brush: e.brush || base.brush };
  }

  function baseEntry(name) {
    return primary().entries.get(name);
  }

  function setEntrySlot(name, slot, value) {
    const base = baseEntry(name);
    if (!base) return;
    const map = edits().entries;
    const cur = map[name] || {};
    if (sameSlot(base[slot], value)) delete cur[slot];
    else cur[slot] = { color: value.color, style: value.style };
    if (cur.pen || cur.brush) map[name] = cur;
    else delete map[name];
  }

  // Sets one slot on a row: on the primary entry and every member that still
  // matched the primary's old colour, or on a single member.
  function setSlot(row, single, slot, value) {
    if (single) {
      setEntrySlot(single, slot, value);
    } else {
      const old = entry(row.primary)[slot];
      for (const n of row.members) {
        if (n === row.primary || sameSlot(entry(n)[slot], old)) setEntrySlot(n, slot, value);
      }
    }
    schedule();
    persistSoon();
  }

  function resetNames(names) {
    beginEdit();
    for (const n of names) delete edits().entries[n];
    commitEdit();
    schedule();
  }

  function beginEdit() {
    if (!state.pending) state.pending = clone(state.edits);
  }

  function commitEdit() {
    if (!state.pending) return;
    const changed = JSON.stringify(state.pending) !== JSON.stringify(state.edits);
    if (changed) {
      state.history.push(state.pending);
      if (state.history.length > 200) state.history.shift();
      state.future = [];
    }
    state.pending = null;
    persist();
    updateChrome();
    if (changed && editor) editor.render();
  }
  const commitPending = commitEdit;

  function undo() {
    commitPending();
    const prev = state.history.pop();
    if (!prev) return;
    state.future.push(clone(state.edits));
    state.edits = prev;
    persist();
    editor.render();
    schedule();
    updateChrome();
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(clone(state.edits));
    state.edits = next;
    persist();
    editor.render();
    schedule();
    updateChrome();
  }

  function countEdits(e) {
    return Object.keys(e.entries).length + Object.keys(e.dtm).length + Object.keys(e.tuning).length;
  }

  function persist() {
    const total = countEdits(state.edits.day) + countEdits(state.edits.night);
    if (total) store.set(STORE_KEY + state.source, state.edits);
    else store.remove(STORE_KEY + state.source);
  }
  let persistTimer = null;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 500);
  }

  function restoreEdits() {
    const saved = store.get(STORE_KEY + state.source);
    state.history = [];
    state.future = [];
    if (saved && saved.day && saved.night) {
      state.edits = { day: Object.assign(emptyEdits(), saved.day), night: Object.assign(emptyEdits(), saved.night) };
      const n = countEdits(state.edits.day) + countEdits(state.edits.night);
      if (n) setTimeout(() => toast(`Restored ${n} unsaved ${n === 1 ? 'change' : 'changes'} from your last visit.`), 300);
    } else {
      state.edits = { day: emptyEdits(), night: emptyEdits() };
    }
  }

  // ---- export / import --------------------------------------------------------

  async function exportZip() {
    commitPending();
    const keepGz = $('#export-gz').checked && canGzip();
    const files = [];
    for (const f of state.files) {
      const text = MIB.mxf.serialize(f.model, state.edits[f.mode] || emptyEdits());
      let data = encodeText(text);
      let path = f.path;
      if (keepGz) {
        data = await gzip(data);
        path += '.gz';
      }
      files.push({ path, data });
    }
    const changed = countEdits(state.edits.day) + countEdits(state.edits.night);
    files.push({
      path: 'README.txt',
      data: encodeText(
        [
          'MapConfigs exported from the MIB2 Map Style Lab (previewer/ in mib2-maps).',
          '',
          `${changed} colour ${changed === 1 ? 'change' : 'changes'} across ${files.length} files. Day files end in _0, night files in _1.`,
          'Only colour, visibility and display-tuning values differ from the files you started with.',
          '',
          'To try it on the car, replace the MapConfigs folder in the deploy/ folder built by',
          'utilities/deploy_scp.ps1, or copy these files over the MapConfigs folder in',
          '/mnt/app/navigation/resources/app/vw/<region>/ on the head unit. Back up the original first.',
          '',
        ].join('\r\n')
      ),
    });
    const blob = await makeZip(files);
    await save('MapConfigs.zip', blob);
  }

  function themeSection(e, model) {
    const colours = Object.entries(e.entries).map(([name, v]) => {
      const base = model.entries.get(name);
      const pen = v.pen || base.pen;
      const brush = v.brush || base.brush;
      return { name, outline: { colour: pen.color, style: pen.style }, fill: { colour: brush.color, style: brush.style } };
    });
    return { colours, dtm: e.dtm, tuning: e.tuning };
  }

  async function exportTheme() {
    commitPending();
    const theme = {
      format: 'mib2-maps-theme',
      version: 1,
      note: 'Colours use #RRGGBBAA. "outline" is the pen colour and "fill" the brush colour, as in mib2-mapbuilder.',
      day: themeSection(state.edits.day, primary('day') || primary()),
      night: themeSection(state.edits.night, primary('night') || primary()),
    };
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    await save('mib2-map-theme.json', blob);
  }

  async function save(name, blob) {
    try {
      const result = await saveFile(name, blob);
      if (result === 'saved') toast(`Saved ${name}.`);
      if (result === 'unsure') toast(`Downloading ${name}. If nothing arrives, this view can't save files; open the page in a browser tab.`);
    } catch (err) {
      toast(err.message || `${name} could not be saved.`, true);
    }
  }

  function importTheme(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      toast('That file is not valid JSON. Choose a theme exported from this page.', true);
      return;
    }
    const read = (section, model) => {
      const out = emptyEdits();
      if (!section) return out;
      const list = Array.isArray(section) ? section : section.colours || [];
      for (const c of list) {
        if (!c || !model.entries.has(c.name)) continue;
        const pen = c.outline && normaliseHex(c.outline.colour);
        const brush = c.fill && normaliseHex(c.fill.colour);
        const v = {};
        if (pen) v.pen = { color: pen, style: c.outline.style || 'solid' };
        if (brush) v.brush = { color: brush, style: c.fill.style || 'solid' };
        if (v.pen || v.brush) out.entries[c.name] = v;
      }
      if (!Array.isArray(section)) {
        for (const [i, hex] of Object.entries(section.dtm || {})) if (normaliseHex(hex)) out.dtm[i] = normaliseHex(hex);
        for (const [k, v] of Object.entries(section.tuning || {})) if (/^\d+$/.test(String(v))) out.tuning[k] = String(v);
      }
      return out;
    };
    beginEdit();
    if (Array.isArray(data)) {
      state.edits[state.mode] = read(data, primary());
    } else if (data && (data.day || data.night)) {
      if (primary('day')) state.edits.day = read(data.day, primary('day'));
      if (primary('night')) state.edits.night = read(data.night, primary('night'));
    } else {
      state.pending = null;
      toast('This JSON has no "day" or "night" colours. Choose a theme exported from this page.', true);
      return;
    }
    commitEdit();
    editor.render();
    schedule();
    const n = countEdits(state.edits.day) + countEdits(state.edits.night);
    toast(`Imported a theme with ${n} ${n === 1 ? 'change' : 'changes'}.`);
  }

  function resetAll() {
    beginEdit();
    state.edits = { day: emptyEdits(), night: emptyEdits() };
    commitEdit();
    editor.render();
    schedule();
    toast('All colours are back to the originals. Undo brings your changes back.');
  }

  // ---- preview ------------------------------------------------------------------

  function routeNames() {
    const t = state.view.routeType;
    return [`route_${t}_active_subtour_1`, `route_${t}_active_subtour_2`, `route_${t}_waypoint_route_manual_marker`];
  }

  function inScene(name) {
    if (MIB.scene.drawn.has(name)) return true;
    if (routeNames().includes(name)) return true;
    return MIB.scene.events.some((ev) => `tmc_${ev.event}_${ev.side}` === name);
  }

  function styleFor() {
    const model = primary();
    return {
      model,
      fontDefs: state.fontDefs,
      entry,
      tuning: (n) => (!state.compare && edits().tuning[n] != null ? edits().tuning[n] : model.tuning.get(n)),
      dtm: () => (state.compare ? model.dtm : model.dtm.map((d, i) => (edits().dtm[i] ? { ...d, color: edits().dtm[i] } : d))),
    };
  }

  function zoomLevels() {
    return state.zoom.filter((z) => z.resolution <= MAX_PREVIEW_RES);
  }

  function viewFor() {
    const z = zoomLevels()[state.view.zoomIndex];
    const [w, h] = SCREENS[state.screen];
    return Object.assign({}, state.view, { res: z.resolution, screenW: w, screenH: h });
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!primary()) return;
      renderer.setStyle(styleFor());
      renderer.setView(viewFor());
      renderer.render();
      updateScreenChrome();
    });
  }

  function zoomLabel(metres) {
    return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  }

  function zoomLabelFor(res) {
    let best = state.zoom[0];
    for (const z of state.zoom) if (z.resolution <= res * 1.02) best = z;
    return res <= state.zoom[0].resolution ? 'all zooms' : `${zoomLabel(best.metres)} and out`;
  }

  function updateScreenChrome() {
    const z = zoomLevels()[state.view.zoomIndex];
    const [w] = SCREENS[state.screen];
    $('[data-zoom-label]').textContent = zoomLabel(z.metres);
    const box = $('[data-zoom-box]');
    box.querySelector('span').textContent = zoomLabel(z.metres);
    const s = $('#screen-host').clientWidth / w;
    // The bar is as long as the distance on the label, at the car's position.
    box.querySelector('i').style.width = `${Math.min(80, (z.metres / z.resolution) * s)}px`;
    $('[data-hu-route]').textContent = `${MIB.catalog.ROUTE_TYPE_LABELS[state.view.routeType]} route`;
    $('[data-hu-mode]').textContent = state.view.threeD ? '3D' : '2D';
    const now = new Date();
    $('[data-hu-clock]').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const stage = $('.stage');
    stage.dataset.mode = state.mode;
    stage.classList.toggle('is-comparing', state.compare);
  }

  function updateChrome() {
    $('#export-toggle').disabled = !state.files.length;
    $('#undo').disabled = !state.history.length && !state.pending;
    $('#redo').disabled = !state.future.length;
    const n = countEdits(state.edits.day) + countEdits(state.edits.night);
    $('[data-edit-count]').textContent = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'No changes yet';
    const stock = state.source === 'stock';
    const rev = state.files.length;
    const days = state.files.filter((f) => f.mode === 'day').length;
    $('[data-source]').textContent = stock
      ? `Stock VW styles from mapstyles/MapConfigs · ${rev} files`
      : `Your files · ${rev} MapConfig ${rev === 1 ? 'file' : 'files'} (${days} day, ${rev - days} night)`;
    $('#back-to-stock').hidden = stock || !state.stockFiles || !state.stockFiles.length;
    for (const b of document.querySelectorAll('[data-set-mode]')) {
      b.setAttribute('aria-pressed', String(b.dataset.setMode === state.mode));
      b.disabled = !state.files.some((f) => f.mode === b.dataset.setMode);
    }
    for (const b of document.querySelectorAll('[data-set-screen]')) {
      b.setAttribute('aria-pressed', String(b.dataset.setScreen === state.screen));
      const hr = b.dataset.setScreen === '1280x640';
      b.disabled = !state.files.some((f) => /1280x640/.test(f.path) === hr);
    }
    for (const b of document.querySelectorAll('[data-set-dim]')) b.setAttribute('aria-pressed', String((b.dataset.setDim === '3d') === state.view.threeD));
  }

  function afterSourceChange() {
    editor.open = null;
    editor.render();
    updateChrome();
    schedule();
  }

  function groups() {
    const model = primary();
    if (!groupCache.has(model)) groupCache.set(model, MIB.catalog.build(model));
    return groupCache.get(model);
  }

  function rowLabelFor(name) {
    for (const g of groups()) for (const r of g.rows) if (r.members.includes(name)) return r.label;
    return MIB.catalog.humanise(name);
  }

  // ---- interaction ----------------------------------------------------------------

  function toast(text, isError) {
    const t = $('.toast');
    t.textContent = text;
    t.classList.toggle('is-error', !!isError);
    t.classList.add('is-shown');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('is-shown'), isError ? 6000 : 3200);
  }

  function setZoom(i) {
    const max = zoomLevels().length - 1;
    state.view.zoomIndex = Math.max(0, Math.min(max, i));
    $('#zoom-in').disabled = state.view.zoomIndex === 0;
    $('#zoom-out').disabled = state.view.zoomIndex === max;
    schedule();
  }

  function recentre() {
    const v = MIB.scene.vehicle;
    Object.assign(state.view, { cx: v.x, cy: v.y, heading: v.heading });
    schedule();
  }

  function wireStage() {
    const host = $('#screen-host');
    const hover = $('[data-hover]');
    let drag = null;
    let hoverFrame = 0;

    const local = (e) => {
      const r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const worldAt = (X, Y) => {
      const [px, py] = renderer.fromScreen(X, Y);
      return renderer.fromCanvas(px, py);
    };

    host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      host.setPointerCapture(e.pointerId);
      const [X, Y] = local(e);
      drag = { X, Y, start: worldAt(X, Y), cx: state.view.cx, cy: state.view.cy, moved: false };
    });
    host.addEventListener('pointermove', (e) => {
      const [X, Y] = local(e);
      if (drag) {
        if (Math.hypot(X - drag.X, Y - drag.Y) > 4) drag.moved = true;
        if (!drag.moved) return;
        // Keep the world point under the pointer where the drag started.
        state.view.cx = drag.cx;
        state.view.cy = drag.cy;
        renderer.setView(viewFor());
        renderer.layout();
        const now = worldAt(X, Y);
        if (!Number.isFinite(now[0]) || Y < renderer.L.Yh + 8) return;
        state.view.cx = drag.cx + (drag.start[0] - now[0]);
        state.view.cy = drag.cy + (drag.start[1] - now[1]);
        schedule();
        return;
      }
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        const name = renderer.pick(X, Y);
        hover.textContent = name ? `${rowLabelFor(name)} · ${name}` : 'Click anything on the map to edit its colour';
        host.style.cursor = name ? 'pointer' : 'grab';
      });
    });
    const end = (e) => {
      if (!drag) return;
      const wasClick = !drag.moved;
      drag = null;
      if (!wasClick) return;
      const [X, Y] = local(e);
      const name = renderer.pick(X, Y);
      if (name && !editor.reveal(name)) toast(`${name} has no colour entry here.`);
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', () => {
      drag = null;
    });
    host.addEventListener('pointerleave', () => {
      hover.textContent = 'Click anything on the map to edit its colour';
    });
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (wheelLock) return;
        wheelLock = true;
        setTimeout(() => (wheelLock = false), 140);
        setZoom(state.view.zoomIndex + (e.deltaY > 0 ? 1 : -1));
      },
      { passive: false }
    );
    let wheelLock = false;
    host.addEventListener('dblclick', () => setZoom(state.view.zoomIndex - 1));
    host.addEventListener('dragover', (e) => {
      e.preventDefault();
      host.classList.add('is-drop');
    });
    host.addEventListener('dragleave', () => host.classList.remove('is-drop'));
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      host.classList.remove('is-drop');
      if (e.dataTransfer.files.length) openFiles([...e.dataTransfer.files]);
    });
    new ResizeObserver(() => schedule()).observe(host);
  }

  function wireToolbar() {
    for (const b of document.querySelectorAll('[data-set-mode]')) {
      b.addEventListener('click', () => {
        commitPending();
        state.mode = b.dataset.setMode;
        afterSourceChange();
      });
    }
    for (const b of document.querySelectorAll('[data-set-screen]')) {
      b.addEventListener('click', () => {
        state.screen = b.dataset.setScreen;
        afterSourceChange();
      });
    }
    for (const b of document.querySelectorAll('[data-set-dim]')) {
      b.addEventListener('click', () => {
        state.view.threeD = b.dataset.setDim === '3d';
        updateChrome();
        schedule();
      });
    }
    $('#zoom-in').addEventListener('click', () => setZoom(state.view.zoomIndex - 1));
    $('#zoom-out').addEventListener('click', () => setZoom(state.view.zoomIndex + 1));
    $('#recentre').addEventListener('click', recentre);
    for (const id of ['route', 'traffic', 'labels']) {
      const box = $(`#layer-${id}`);
      box.checked = state.view[id];
      box.addEventListener('change', () => {
        state.view[id] = box.checked;
        schedule();
      });
    }
    const type = $('#route-type');
    type.addEventListener('change', () => {
      state.view.routeType = type.value;
      editor.render();
      schedule();
    });

    const compare = $('#compare');
    const on = (e) => {
      e.preventDefault();
      state.compare = true;
      compare.setAttribute('aria-pressed', 'true');
      schedule();
    };
    const off = () => {
      if (!state.compare) return;
      state.compare = false;
      compare.setAttribute('aria-pressed', 'false');
      schedule();
    };
    compare.addEventListener('pointerdown', on);
    compare.addEventListener('pointerup', off);
    compare.addEventListener('pointerleave', off);
    compare.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') on(e);
    });
    compare.addEventListener('keyup', off);

    $('#undo').addEventListener('click', undo);
    $('#redo').addEventListener('click', redo);
    document.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if (e.target.matches('input[type="text"], input[type="search"]')) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    });

    const filePicker = $('#file-picker');
    $('#open-files').addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', () => {
      if (filePicker.files.length) openFiles([...filePicker.files]);
      filePicker.value = '';
    });
    $('#back-to-stock').addEventListener('click', () => {
      commitPending();
      state.files = state.stockFiles;
      state.source = 'stock';
      restoreEdits();
      pickAvailableMode();
      afterSourceChange();
    });

    const menu = $('#export-menu');
    const toggle = $('#export-toggle');
    const close = () => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !e.target.closest('.menu')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    $('#export-gz').disabled = !canGzip();
    $('#export-zip').addEventListener('click', () => {
      close();
      exportZip();
    });
    $('#export-theme').addEventListener('click', () => {
      close();
      exportTheme();
    });
    const themePicker = $('#theme-picker');
    $('#import-theme').addEventListener('click', () => {
      close();
      themePicker.click();
    });
    themePicker.addEventListener('change', async () => {
      const f = themePicker.files[0];
      themePicker.value = '';
      if (f) importTheme(await f.text());
    });
    $('#reset-all').addEventListener('click', () => {
      close();
      resetAll();
    });
  }

  async function boot() {
    renderer = new MIB.Renderer($('#screen-host'));
    editor = new MIB.Editor($('.panel'), {
      groups,
      entry,
      base: baseEntry,
      inScene,
      drawnNow: (names) => names.some((n) => renderer.drawn.has(n)),
      isEdited: (n) => !!edits().entries[n],
      isEditedAny: (key) => Object.keys(edits()[key]).length > 0,
      isDtmEdited: (i) => edits().dtm[i] != null,
      isTuningEdited: (n) => edits().tuning[n] != null,
      setSlot,
      reset: resetNames,
      beginEdit,
      commitEdit,
      dtm: () => styleFor().dtm(),
      setDtm: (i, hex) => {
        const base = primary().dtm[i];
        if (base && base.color === hex) delete edits().dtm[i];
        else edits().dtm[i] = hex;
        schedule();
        persistSoon();
      },
      tuning: (n) => styleFor().tuning(n),
      setTuning: (n, v) => {
        if (primary().tuning.get(n) === String(v)) delete edits().tuning[n];
        else edits().tuning[n] = String(v);
        schedule();
        persistSoon();
      },
      zoomLabelFor,
    });
    wireToolbar();
    wireStage();
    recentre();
    loadLabelFonts();

    const files = await loadStock();
    state.stockFiles = files;
    $('.stage').classList.remove('is-loading');
    if (!files.length) {
      $('#export-toggle').disabled = true;
      $('.stage').classList.add('is-empty');
      $('[data-source]').textContent = 'Open your MapConfig files to start';
      $('[data-list]').replaceChildren(
        el('p', { class: 'empty' }, [
          'The stock styles in mapstyles/ could not be loaded. This happens when the page is opened straight from disk. Open the .mxf or .mxf.gz files from a MapConfigs folder with ',
          el('strong', { text: 'Open files' }),
          ', or serve the repository folder (for example ',
          el('code', { text: 'python3 -m http.server' }),
          ') and open /previewer/.',
        ])
      );
      return;
    }
    state.files = files;
    state.source = 'stock';
    restoreEdits();
    pickAvailableMode();
    setZoom(state.view.zoomIndex);
    afterSourceChange();
    setInterval(updateScreenChrome, 30000);
  }

  // The VW fonts ship in mapstyles/Font; use them for labels when they're there.
  function loadLabelFonts() {
    if (document.fonts) document.fonts.ready.then(schedule);
    if (!('FontFace' in window) || window.MIB_LABEL_FONTS === false) return;
    const faces = [
      ['VWTextCarUI-Regular.ttf', 400],
      ['VWTextCarUI-Bold.ttf', 600],
      ['VWTextCarUI-Light.ttf', 300],
    ];
    const tryBase = (i) => {
      if (i >= BASES.length) return; // not available here: labels use the fallback stack
      const loads = faces.map(([file, weight]) => new FontFace('VWTextCarUI', `url(${BASES[i]}Font/${file})`, { weight: String(weight) }).load());
      Promise.all(loads)
        .then((fonts) => {
          fonts.forEach((f) => document.fonts.add(f));
          schedule();
        })
        .catch(() => tryBase(i + 1));
    };
    tryBase(0);
  }

  // For poking at the previewer from the browser console.
  MIB.debug = { state, get renderer() { return renderer; }, schedule };

  document.addEventListener('DOMContentLoaded', boot);
})((window.MIB = window.MIB || {}));
