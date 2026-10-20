#!/usr/bin/env node
// Builds alternate map styles in mapstyles-alt/ from the palettes in utilities/palettes, onto the
// stock Audi MapConfigs, and lists them in mapstyles-alt/index.json.
//
//   node utilities/build-styles.js               build every palette
//   node utilities/build-styles.js carta folio   build these ones
//   node utilities/build-styles.js --check       only report what would change
//
// A palette is utilities/palettes/<id>.js, and <id> is the style's folder in mapstyles-alt. Only
// colours change: every entry keeps the stock file's shown, hidden and pattern styles. The files
// are written the way the previewer exports a style: the Standard and traffic maps get the
// palette's colours, and the satellite map follows the Standard map wherever the two had the same
// colour. Files whose contents haven't changed are left alone.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { parseArgs } = require('util');
const { ROOT, MIB } = require('./lib/previewer');
const { hex, mix, alpha } = require('./lib/colour');

const STOCK_DIR = path.join(ROOT, 'mapstyles-audidefault');
const ALT_DIR = path.join(ROOT, MIB.library.ALT_DIR);
const PALETTE_DIR = path.join(__dirname, 'palettes');
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const ROAD_CLASSES = ['motorway', 'dualcarriageway', 'expressway', 'countryroad', 'urbanroad'];

// A palette has a `name`, a `description` for the style picker, and `day` and `night` colours:
//   land, builtUp, building, cityModels (fill), cityModelsEdge, park, woodland, green2 (golf
//     courses, cemeteries, stadiums), glacier, beach, water, sea, airport, aircraft, industry,
//     place (hospitals, schools and other sites), parking, station, pedestrian (areas)
//   bridge [outline, fill], bridgeShadow
//   motorway, dual, express, country, urban: [casing, fill] for each road class, which their
//     tunnels, bridges, toll and seasonal variants follow
//   pedestrianRoad [casing, fill], footway, restricted [casing, fill], oneWay (arrows)
//   rail [outline, fill] (rail draws its fill dashed in the outline colour), tram, ferry
//   boundary, ink (contour lines and tunnel shading)
//   text, halo, cityText, areaText, waterText, waterHalo: label text and halo colours
//   skyTop, skyHorizon, haze: the 3D sky and the haze at the horizon
//   route: the route line for the fast, short, economical, custom 1 and custom 2 route types
//   alternatives: the alternative routes, which the route list tells apart by colour
//   routeCore: the centre line of a route
//   ok, warnLight, warn, danger, muted, flowEdge: traffic flow and incident colours
//   trafficWash: how far, from 0 to 1, the traffic map washes colours towards the land colour
//   dtm(height, metresPerPixel): the terrain colour at a height, for each zoom range
// Colours are #RRGGBB or #RRGGBBAA.

// The palette's colours for the entries it covers, as { name: { pen, brush } }. The pen is the
// outline, casing or halo; the brush is the fill or text.
function expand(p, model) {
  const out = {};
  const set = (name, pen, brush) => {
    const e = model.entries.get(name);
    if (!e) return;
    out[name] = { pen: pen ? hex(pen) : e.pen.color, brush: brush ? hex(brush) : e.brush.color };
  };
  // land, water, places
  set('map_background', p.land, p.land);
  set('built_up', null, p.builtUp);
  set('island', null, p.land);
  set('beach', null, p.beach);
  set('woodland', null, p.woodland);
  set('park', null, p.park);
  set('park_in_water', null, p.park);
  set('golfcourse', null, p.green2);
  set('cemetery', null, p.green2);
  set('moor', null, p.woodland);
  set('glacier', null, p.glacier);
  for (const w of ['ocean', 'river', 'lake', 'canal', 'harbour_port', 'industrial_harbour', 'waterway']) set(w, null, w === 'ocean' ? p.sea : p.water);
  set('airport', null, p.airport);
  set('aircraft', null, p.aircraft);
  set('industry', null, p.industry);
  for (const n of ['company', 'hospital', 'school', 'university_college', 'shoppingcenter', 'military_base', 'native_american_reservation', 'ski_resort', 'environmental_zone']) set(n, null, p.place);
  set('stadium', null, p.green2);
  set('traffic_area_parking', null, p.parking);
  set('railway_station', null, p.station);
  set('pedestrian_area', null, p.pedestrian);
  set('building', null, p.building);
  set('city_models', p.cityModelsEdge, p.cityModels);
  set('bridge', p.bridge[0], p.bridge[1]);
  set('bridge_shadow', p.bridgeShadow, p.bridgeShadow);
  set('elevated', p.bridge[0], p.bridge[1]);
  set('tunnel', alpha(p.ink, 0.45), alpha(p.ink, 0.45));
  // roads and their variants
  const roads = { motorway: p.motorway, dualcarriageway: p.dual, expressway: p.express, countryroad: p.country, urbanroad: p.urban };
  for (const cls of ROAD_CLASSES) {
    const [casing, fill] = roads[cls];
    set(cls, casing, fill);
    for (const v of ['bridge', 'toll', 'special_charge', 'hov_lane']) set(`${cls}_${v}`, casing, fill);
    set(`${cls}_tunnel`, mix(casing, p.land, 0.35), mix(fill, p.land, 0.55));
    set(`${cls}_seasonally_restricted`, mix(casing, p.land, 0.25), mix(fill, p.land, 0.4));
  }
  set('pedestrianzone', p.pedestrianRoad[0], p.pedestrianRoad[1]);
  set('footway', p.footway, p.footway);
  for (const n of ['hiking_trail_main', 'hiking_trail_bike', 'hiking_trail_fixed_rope']) set(n, p.footway, p.footway);
  set('restricted_road', p.restricted[0], p.restricted[1]);
  set('enclosed_traffic_area_road', p.urban[0], p.urban[1]);
  set('one_way_street', p.urban[0], p.urban[1]);
  set('one_way_arrows', p.oneWay, p.oneWay);
  // rail and ferries
  set('railway', p.rail[0], p.rail[1]);
  set('suburban_train', p.rail[0], p.rail[1]);
  set('cartrain', p.rail[0], p.rail[1]);
  set('subway', p.tram, p.tram);
  set('tramway', p.tram, p.tram);
  set('ferry', p.ferry, p.ferry);
  // borders and contours
  for (const n of ['international_boundary', 'national_boundary', 'cartographic_country_boundary']) set(n, p.boundary, p.boundary);
  set('major_contour_line', alpha(p.ink, 0.4), alpha(p.ink, 0.4));
  set('minor_contour_line', alpha(p.ink, 0.25), alpha(p.ink, 0.25));
  for (const name of model.entries.keys()) if (/^topographic_contour_\d+$/.test(name)) set(name, alpha(p.ink, 0.3), alpha(p.ink, 0.3));
  // labels: the brush is the text, the pen its halo
  for (const n of ['road_label', 'poi_label', 'weather_label', 'poi_fuelprice_label', 'horizon_marker_label', 'destination_label', 'tunnel_label']) set(n, p.halo, p.text);
  for (const n of ['city_label', 'capital_city_label', 'province_label', 'province_capital_label', 'prefectural_city_label']) set(n, p.halo, p.cityText);
  for (const n of ['river_label', 'waterway_label', 'sea_label']) set(n, p.waterHalo, p.waterText);
  set('island_label', p.halo, p.text);
  set('polygon_label', p.halo, p.areaText);
  set('point_name_highlight', p.halo, p.text);
  // sky and haze
  set('sky_background', p.skyHorizon, p.skyTop);
  set('fog', p.haze, p.haze);
  // routes: one colour per route type; later legs get a paler core
  const routeColour = { fast: p.route[0], short: p.route[1], economic: p.route[2], custom1: p.route[3], custom2: p.route[4] };
  for (const name of model.entries.keys()) {
    const m = /^route_(fast|short|economic|custom1|custom2)(?:_alternative(\d))?_(.+)$/.exec(name);
    if (!m) continue;
    const band = m[1] === 'custom2' && m[2] ? p.alternatives[(+m[2] - 1) % p.alternatives.length] : routeColour[m[1]];
    const leg = mix(band, p.land, 0.62);
    const role = m[3];
    if (role === 'waypoint_route_manual_marker') set(name, leg, band);
    else if (/^active_subtour_(\d+)$/.test(role) && role !== 'active_subtour_1') set(name, band, leg);
    else if (role === 'waypoint_route' || role === 'waypoint_route_automatic_marker') set(name, band, leg);
    else set(name, band, p.routeCore);
  }
  set('route_blocking', p.danger, p.danger);
  // traffic flow, and incidents by the colour the stock file gave them
  const flow = {
    free_traffic: p.ok,
    heavy_traffic: p.warnLight,
    slow_traffic: p.warn,
    queuing_traffic: p.warn,
    stationary_traffic: p.danger,
    no_traffic: p.danger,
    unknown: p.muted,
  };
  for (const [k, c] of Object.entries(flow)) set(`speed_and_flow_${k}`, p.flowEdge, c);
  for (const [name, e] of model.entries) {
    if (!/^(tmc|tti)_/.test(name)) continue;
    const { r, g, b } = MIB.util.hexToRgba(e.pen.color);
    const reddish = r > 150 && g < 90 && b < 90;
    const orange = r > 200 && g > 100 && g < 190 && b < 80;
    out[name] = { pen: hex(reddish ? p.danger : orange ? p.warn : p.muted), brush: e.brush.color };
  }
  return out;
}

// The traffic map: the same colours washed towards the land colour, so traffic stands out.
// Routes, traffic, labels and the sky keep their colours.
function washed(colours, p) {
  const out = {};
  for (const [name, v] of Object.entries(colours)) {
    if (/^(route_|speed_and_flow_|tmc_|tti_|sky_background|fog$)/.test(name) || /_label$/.test(name)) out[name] = v;
    else out[name] = { pen: mix(v.pen, p.land, p.trafficWash), brush: mix(v.brush, p.land, p.trafficWash) };
  }
  return out;
}

// Colours and terrain colours as edits to one stock file: only the values that differ from it,
// keeping the file's styles.
function editsTo(model, colours, terrain) {
  const entries = {};
  for (const [name, c] of Object.entries(colours)) {
    const e = model.entries.get(name);
    if (!e) continue;
    const v = {};
    if (c.pen !== e.pen.color) v.pen = { color: c.pen, style: e.pen.style };
    if (c.brush !== e.brush.color) v.brush = { color: c.brush, style: e.brush.style };
    if (v.pen || v.brush) entries[name] = v;
  }
  const dtm = {};
  model.dtm.forEach((d, i) => {
    const c = hex(terrain(d));
    if (c !== d.color) dtm[i] = c;
  });
  return { entries, dtm, tuning: {} };
}

const sameSlot = (a, b) => a && b && a.color === b.color && a.style === b.style;

// What changes in one file, as in the previewer: its own map type's edits, and on the other map
// types the Standard map's edits wherever the file had the same value as the Standard map.
function editsForFile(f, edits, std) {
  const own = edits[f.variant];
  const fromStd = f.variant === 'default' ? null : edits.default;
  const out = { entries: {}, dtm: {}, tuning: {} };
  for (const [name, mine] of f.model.entries) {
    const v = {};
    for (const slot of ['pen', 'brush']) {
      const edit = own && own.entries[name] && own.entries[name][slot];
      const stdEdit = fromStd && fromStd.entries[name] && fromStd.entries[name][slot];
      const base = std.entries.get(name);
      if (edit) v[slot] = edit;
      else if (stdEdit && base && sameSlot(base[slot], mine[slot])) v[slot] = stdEdit;
    }
    if (v.pen || v.brush) out.entries[name] = v;
  }
  f.model.dtm.forEach((d, i) => {
    const b = std.dtm[i];
    if (own && own.dtm[i]) out.dtm[i] = own.dtm[i];
    else if (fromStd && fromStd.dtm[i] && b && b.color === d.color && b.height === d.height && b.resolution === d.resolution) out.dtm[i] = fromStd.dtm[i];
  });
  return out;
}

function stockFiles() {
  const dir = path.join(STOCK_DIR, 'MapConfigs');
  return fs
    .readdirSync(dir)
    .filter((name) => /^mapconfig_.*\.mxf\.gz$/.test(name))
    .sort()
    .map((name) => {
      const text = MIB.util.decodeText(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))));
      return { path: `MapConfigs/${name}`, mode: MIB.mxf.modeFromName(name), variant: MIB.mxf.variantFromName(name), model: MIB.mxf.parse(text, name) };
    });
}

// The style's files, as [{ path, data, changes }].
function buildStyle(palette, files) {
  const out = [];
  for (const mode of ['day', 'night']) {
    const p = palette[mode];
    const inMode = files.filter((f) => f.mode === mode);
    const std = inMode.find((f) => f.variant === 'default');
    if (!std) throw new Error(`The stock styles have no Standard ${mode} map.`);
    const colours = expand(p, std.model);
    const terrain = (d) => p.dtm(d.height, d.resolution / 256);
    const edits = { default: editsTo(std.model, colours, terrain) };
    const traffic = inMode.find((f) => f.variant === 'traffic');
    if (traffic) edits.traffic = editsTo(traffic.model, washed(colours, p), (d) => mix(terrain(d), p.land, p.trafficWash));
    for (const f of inMode) {
      const fileEdits = editsForFile(f, edits, std.model);
      const slots = Object.values(fileEdits.entries).reduce((n, v) => n + !!v.pen + !!v.brush, 0);
      const changes = slots + Object.keys(fileEdits.dtm).length;
      out.push({ path: f.path, data: Buffer.from(MIB.util.encodeText(MIB.mxf.serialize(f.model, fileEdits))), changes });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function readIfThere(file) {
  try {
    return fs.readFileSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function main() {
  const { values: opt, positionals: ids } = parseArgs({ options: { check: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true });
  if (opt.help) {
    console.log('Usage: node utilities/build-styles.js [--check] [palette ...]\nBuilds mapstyles-alt/<palette> from utilities/palettes/<palette>.js; all of them by default.');
    return;
  }
  const available = fs
    .readdirSync(PALETTE_DIR)
    .filter((name) => name.endsWith('.js'))
    .map((name) => name.slice(0, -3))
    .sort();
  for (const id of ids) if (!available.includes(id)) throw new Error(`There's no palette ${id}. The palettes are: ${available.join(', ')}.`);
  const files = stockFiles();
  const indexFile = path.join(ALT_DIR, 'index.json');
  const indexText = readIfThere(indexFile);
  let index = { styles: indexText ? MIB.library.parseIndex(indexText.toString('utf8')) : [] };
  let pending = 0;

  for (const id of ids.length ? ids : available) {
    if (!ID_PATTERN.test(id)) throw new Error(`${id}.js: palette file names are lower case letters, digits and dashes.`);
    const palette = require(path.join(PALETTE_DIR, `${id}.js`));
    console.log(`${palette.name} (mapstyles-alt/${id})`);
    for (const file of buildStyle(palette, files)) {
      const target = path.join(ALT_DIR, id, file.path);
      const current = readIfThere(target);
      const same = current && zlib.gunzipSync(current).equals(file.data);
      console.log(`  ${file.path}: ${file.changes} colours differ from stock, ${same ? 'unchanged' : opt.check ? 'would change' : 'written'}`);
      if (same) continue;
      pending += 1;
      if (opt.check) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, zlib.gzipSync(file.data));
    }
    index = MIB.library.indexWith(index.styles, { id, name: palette.name, description: palette.description || '', base: 'audi' });
  }

  const text = `${JSON.stringify(index, null, 2)}\n`;
  const indexSame = indexText && indexText.toString('utf8') === text;
  console.log(`index.json: ${indexSame ? 'unchanged' : opt.check ? 'would change' : 'written'}`);
  if (!indexSame) {
    pending += 1;
    if (!opt.check) fs.writeFileSync(indexFile, text);
  }
  if (opt.check && pending) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
