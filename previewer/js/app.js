// Boots the previewer: loads a map style (the stock Audi A4 styles, an
// alternate style from mapstyles-alt/, or a draft made in this browser), wires
// the toolbar, keeps edits with undo, and exports a ready-to-copy MapConfigs
// folder or a style folder for mapstyles-alt/.
(function (MIB) {
  'use strict';
  const { el, store, gunzipIfNeeded, decodeText, encodeText, makeZip, saveFile, gzip, normaliseHex } = MIB.util;
  const { sameSlot } = MIB.editorHelpers;
  const { ALT_DIR } = MIB.library;

  // The style sets in this repository. Each MapConfig file is a day (_0) or
  // night (_1) config for one map type; `screens` are the displays the
  // previewer can imitate, with the zoom table the head unit uses for each.
  const STYLE_SETS = [
    {
      id: 'audi',
      name: 'Audi A4 · MMI Navigation plus',
      stockName: 'Stock Audi styles',
      dir: 'mapstyles-audidefault/',
      files: [
        'MapConfigs/mapconfig_default_0_DTM.mxf.gz',
        'MapConfigs/mapconfig_default_1_DTM.mxf.gz',
        'MapConfigs/mapconfig_sat_default_0_DTM.mxf.gz',
        'MapConfigs/mapconfig_sat_default_1_DTM.mxf.gz',
        'MapConfigs/mapconfig_traffic_0.mxf.gz',
        'MapConfigs/mapconfig_traffic_1.mxf.gz',
      ],
      fontConfig: 'MapConfigs/fontconfig_audi_0.fcx',
      // Both displays use the same MapConfigs; only the zoom tables differ.
      // The MMI map area is the 8.3" 1024x480 screen less its status bar.
      screens: [
        { id: 'mmi', label: 'MMI 1024×436', size: [1024, 436], zoom: 'pcconfig/1024x436/zoomlevel_instance0.xml.gz' },
        { id: 'vc', label: 'Virtual Cockpit 1440×540', size: [1440, 540], zoom: 'pcconfig/1440x540/zoomlevel_instance0.xml.gz' },
      ],
    },
    {
      id: 'vw',
      name: 'VW Discover Pro (reference)',
      stockName: 'Stock VW styles',
      dir: 'mapstyles/',
      files: [
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
      ],
      fontConfig: 'MapConfigs/fontconfig_default_0.fcx',
      // Each VW screen size has its own MapConfigs folder, and the screen includes the status bar.
      screens: [
        { id: '1280x640', label: '1280×640', size: [1280, 640], folder: 'MapConfigs/1280x640/', zoom: 'pcconfig/zoomlevel_instance0.xml.gz', statusBar: true },
        { id: '800x480', label: '800×480', size: [800, 480], folder: 'MapConfigs/', zoom: 'pcconfig/zoomlevel_instance0.xml.gz', statusBar: true },
      ],
    },
  ];

  // The page lives in previewer/, beside the style folders. A copy hosted
  // elsewhere can set window.MIB_STYLES_ROOT to where those folders are.
  const ROOTS = window.MIB_STYLES_ROOT != null ? [window.MIB_STYLES_ROOT] : ['../', ''];
  const STORE_KEY = 'mib2-style-lab:v2:';
  const LAST_STYLE_KEY = 'mib2-style-lab:style';
  const VARIANTS = ['default', 'sat', 'traffic', 'kombi'];
  const VARIANT_LABELS = { default: 'Standard', sat: 'Satellite', traffic: 'Traffic', kombi: 'Cluster' };

  // Metric zoom steps, used if a set's zoom table can't be loaded.
  const FALLBACK_ZOOM = [
    [30, 0.35], [50, 0.59], [75, 0.88], [100, 1.17], [150, 1.75], [200, 2.33], [300, 3.49], [400, 4.66], [500, 5.82],
    [750, 8.73], [1000, 11.63], [1500, 17.45], [2000, 23.26],
  ].map(([metres, resolution]) => ({ metres, resolution, tilt: 34 }));
  const MAX_PREVIEW_RES = 24; // up to the 2 km step; further out the sample city runs out

  const emptyEdits = () => ({ entries: {}, dtm: {}, tuning: {} });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const state = {
    set: STYLE_SETS[0],
    style: null, // { key, kind: 'stock' | 'alt' | 'draft' | 'custom', set, name, alt?, draft? }
    alts: [], // styles listed in mapstyles-alt/index.json
    drafts: [], // styles made with "New style", kept in this browser
    loaded: {}, // set id or alt:<id> -> { files, fontDefs, zoomBy, root, missing }
    files: [], // { path, name, mode, variant, screen, model, gz }
    fontDefs: null,
    zoomBy: {},
    source: STYLE_SETS[0].id,
    mode: 'day',
    variant: 'default',
    screen: STYLE_SETS[0].screens[0].id,
    edits: { day: {}, night: {} }, // mode -> variant -> { entries, dtm, tuning }
    history: [],
    future: [],
    pending: null,
    compare: false,
    view: {
      metres: 200,
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

  // A hosted copy may only be able to serve these files unpacked, named .xml
  // (window.MIB_MAPSTYLES_XML): x.mxf.gz becomes x.mxf.xml.
  function servedName(path) {
    if (!window.MIB_MAPSTYLES_XML || !/\.(gz|mxf|fcx)$/.test(path)) return path;
    const plain = path.replace(/\.gz$/, '');
    return /\.xml$/.test(plain) ? plain : `${plain}.xml`;
  }

  async function fetchBytes(path, roots = ROOTS) {
    for (const root of roots) {
      try {
        const res = await fetch(root + servedName(path), { cache: 'no-cache' });
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length) continue;
        return { bytes: await gunzipIfNeeded(bytes), root };
      } catch (_) {
        /* try the next location */
      }
    }
    return null;
  }

  // Which screen a file belongs to: VW keeps a MapConfigs folder per screen
  // size; Audi files serve every screen (null).
  function screenForPath(set, path) {
    const folders = set.screens.filter((s) => s.folder != null);
    if (!folders.length) return null;
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    const hit = folders.find((s) => dir === s.folder);
    return hit ? hit.id : null;
  }

  function fileRecord(set, path, text, gz) {
    const name = path.split('/').pop();
    return {
      path,
      name,
      mode: MIB.mxf.modeFromName(name) || state.mode,
      variant: MIB.mxf.variantFromName(name),
      screen: screenForPath(set, path),
      model: MIB.mxf.parse(text, name),
      gz,
    };
  }

  async function loadSet(set) {
    if (state.loaded[set.id]) return state.loaded[set.id];
    // Browsers don't let a page opened from disk read neighbouring files.
    if (location.protocol === 'file:') return null;
    const results = await Promise.all(set.files.map((p) => fetchBytes(set.dir + p)));
    const files = [];
    let root = null;
    results.forEach((r, i) => {
      if (!r) return;
      root = root == null ? r.root : root;
      try {
        files.push(fileRecord(set, set.files[i].replace(/\.gz$/, ''), decodeText(r.bytes), /\.gz$/.test(set.files[i])));
      } catch (err) {
        console.warn(err);
      }
    });
    if (!files.length) return null;
    const roots = [root];
    const fcx = await fetchBytes(set.dir + set.fontConfig, roots);
    const zoomBy = {};
    await Promise.all(
      set.screens.map(async (s) => {
        const z = await fetchBytes(set.dir + s.zoom, roots);
        const levels = z ? MIB.mxf.parseZoomLevels(decodeText(z.bytes)) : [];
        zoomBy[s.id] = levels.length ? levels : FALLBACK_ZOOM;
      })
    );
    const loaded = { files, fontDefs: fcx ? MIB.mxf.parseFontConfig(decodeText(fcx.bytes)) : null, zoomBy, root };
    state.loaded[set.id] = loaded;
    loadLabelFonts(set, loaded);
    return loaded;
  }

  // An alternate style replaces some or all of a stock set's MapConfigs with
  // the files in mapstyles-alt/<id>/; fonts and zoom tables stay the set's own.
  async function loadAlt(set, alt) {
    const key = `alt:${alt.id}`;
    if (state.loaded[key]) return state.loaded[key];
    const stock = await loadSet(set);
    if (!stock) return null;
    const plain = (p) => p.replace(/\.gz$/, '');
    const listed = alt.files ? new Set(alt.files.map(plain)) : null;
    const missing = [];
    const files = await Promise.all(
      stock.files.map(async (f) => {
        if (listed && !listed.has(f.path)) return f;
        const dir = `${ALT_DIR}${alt.id}/`;
        // Styles are saved with the stock names (.mxf.gz); an unpacked .mxf is read too.
        let gz = true;
        let r = await fetchBytes(`${dir}${f.path}.gz`, [stock.root]);
        if (!r) {
          gz = false;
          r = await fetchBytes(`${dir}${f.path}`, [stock.root]);
        }
        if (!r) {
          missing.push(f.name);
          return f;
        }
        try {
          return fileRecord(set, f.path, decodeText(r.bytes), gz);
        } catch (err) {
          missing.push(f.name);
          return f;
        }
      })
    );
    const loaded = Object.assign({}, stock, { files, missing });
    state.loaded[key] = loaded;
    return loaded;
  }

  async function loadIndex() {
    if (location.protocol === 'file:') return [];
    const r = await fetchBytes(`${ALT_DIR}index.json`);
    if (!r) return [];
    try {
      return MIB.library.parseIndex(decodeText(r.bytes)).filter((s) => STYLE_SETS.some((set) => set.id === s.base));
    } catch (err) {
      toast(err.message || 'mapstyles-alt/index.json could not be read.', true);
      return [];
    }
  }

  // Every style the picker offers, grouped by the stock set it's built on.
  function allStyles() {
    const out = [];
    for (const set of STYLE_SETS) {
      out.push({ key: set.id, kind: 'stock', set, name: set.stockName });
      for (const alt of state.alts.filter((a) => a.base === set.id)) out.push({ key: `alt:${alt.id}`, kind: 'alt', set, name: alt.name, alt });
      for (const draft of state.drafts.filter((d) => d.base === set.id)) out.push({ key: `draft:${draft.id}`, kind: 'draft', set, name: draft.name, draft });
    }
    return out;
  }

  const styleByKey = (key) => allStyles().find((s) => s.key === key) || null;

  async function useStyle(key) {
    const style = styleByKey(key) || styleByKey(STYLE_SETS[0].id);
    commitPending();
    // A draft shows the files of the style it started from, with its own edits.
    const filesFrom = style.kind === 'draft' ? styleByKey(style.draft.from) || styleByKey(style.set.id) : style;
    const loaded = filesFrom.kind === 'alt' ? await loadAlt(style.set, filesFrom.alt) : await loadSet(style.set);
    if (!loaded) {
      toast(`The ${style.set.name} styles could not be loaded from ${style.set.dir}.`, true);
      return false;
    }
    state.style = style;
    state.set = style.set;
    state.files = loaded.files;
    state.fontDefs = loaded.fontDefs;
    state.zoomBy = loaded.zoomBy;
    state.source = style.key;
    store.set(LAST_STYLE_KEY, style.key);
    if (!style.set.screens.some((s) => s.id === state.screen)) state.screen = style.set.screens[0].id;
    $('.stage').classList.remove('is-empty');
    restoreEdits();
    pickAvailable();
    afterSourceChange();
    if (loaded.missing && loaded.missing.length) {
      toast(`${loaded.missing.length} of ${filesFrom.name}'s files weren't found in ${ALT_DIR}${filesFrom.alt.id}/, so the stock ones are shown instead.`, true);
    }
    return true;
  }

  async function openFiles(list) {
    const files = [];
    const problems = [];
    let fontDefs = null;
    for (const file of list) {
      try {
        const text = decodeText(await gunzipIfNeeded(new Uint8Array(await file.arrayBuffer())));
        if (/\.fcx$/i.test(file.name) || /<xmlfontconfig/.test(text.slice(0, 400))) {
          fontDefs = MIB.mxf.parseFontConfig(text);
          continue;
        }
        const gz = /\.gz$/i.test(file.name);
        const name = file.name.replace(/\.gz$/i, '');
        const rel = (file.webkitRelativePath || '').replace(/\.gz$/i, '');
        let path = rel && rel.includes('MapConfigs') ? rel.slice(rel.indexOf('MapConfigs')) : `MapConfigs/${name}`;
        // VW keeps 1280x640 configs in their own folder. Without a folder path,
        // tell them apart by their label fonts, which use ids of 100 and up.
        if (!rel && state.set.id === 'vw') {
          const model = MIB.mxf.parse(text, file.name);
          const city = model.fonts.find((f) => f.type === 'city_label');
          if (city && city.id >= 100) path = `MapConfigs/1280x640/${name}`;
        }
        if (files.some((f) => f.path === path)) {
          problems.push(`${file.name} was opened twice; the first copy is used.`);
          continue;
        }
        files.push(fileRecord(state.set, path, text, gz));
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
    if (fontDefs) state.fontDefs = fontDefs;
    if (!Object.keys(state.zoomBy).length) state.zoomBy = Object.fromEntries(state.set.screens.map((s) => [s.id, FALLBACK_ZOOM]));
    state.source = `custom:${state.set.id}:${files.map((f) => f.path).sort().join('|')}`;
    state.style = { key: state.source, kind: 'custom', set: state.set, name: 'Your files' };
    restoreEdits();
    pickAvailable();
    afterSourceChange();
    toast(`Opened ${files.length} ${files.length === 1 ? 'file' : 'files'}${problems.length ? `. ${problems.length} could not be read` : ''}.`);
  }

  // Keeps day/night, map type and screen on choices the loaded files offer.
  function pickAvailable() {
    if (!state.files.some((f) => f.mode === state.mode)) state.mode = state.files[0].mode;
    const variants = variantsFor(state.mode);
    if (!variants.includes(state.variant)) state.variant = variants[0];
    const screens = availableScreens();
    if (!screens.some((s) => s.id === state.screen)) state.screen = screens[0].id;
  }

  function variantsFor(mode) {
    const present = new Set(state.files.filter((f) => f.mode === mode).map((f) => f.variant));
    return VARIANTS.filter((v) => present.has(v));
  }

  function availableScreens() {
    const screens = state.set.screens.filter((s) => state.files.some((f) => f.screen == null || f.screen === s.id));
    return screens.length ? screens : state.set.screens;
  }

  function currentScreen() {
    return state.set.screens.find((s) => s.id === state.screen) || state.set.screens[0];
  }

  // The file shown for a day/night mode, map type and screen.
  function primaryFile(mode = state.mode, variant = state.variant) {
    const pool = state.files.filter((f) => f.mode === mode && f.variant === variant);
    const forScreen = pool.filter((f) => f.screen === state.screen);
    const candidates = forScreen.length ? forScreen : pool.filter((f) => f.screen == null).length ? pool.filter((f) => f.screen == null) : pool;
    return candidates.find((f) => /^mapconfig_(sat_)?default_[01]_DTM/i.test(f.name)) || candidates[0] || null;
  }

  function primary(mode, variant) {
    const f = primaryFile(mode, variant);
    return f ? f.model : null;
  }

  // ---- edits ----------------------------------------------------------------
  //
  // Edits are stored per day/night mode and map type. An edit on the Standard
  // map also applies to the other map types wherever they used the same colour
  // as the Standard map, so the satellite and traffic maps follow along without
  // losing the colours they deliberately do differently.

  function editsOf(mode, variant) {
    const byMode = state.edits[mode] || (state.edits[mode] = {});
    return byMode[variant] || (byMode[variant] = emptyEdits());
  }

  // The edit that applies to one slot of an entry in a file's model, or null.
  function slotEdit(model, mode, variant, name, slot) {
    const mine = model.entries.get(name);
    if (!mine) return null;
    const own = editsOf(mode, variant).entries[name];
    if (own && own[slot]) {
      const ref = primary(mode, variant);
      const base = ref && ref.entries.get(name);
      if (model === ref || (base && sameSlot(base[slot], mine[slot]))) return own[slot];
    }
    return inheritedSlot(model, mode, variant, name, slot);
  }

  function inheritedSlot(model, mode, variant, name, slot) {
    if (variant === 'default') return null;
    const std = editsOf(mode, 'default').entries[name];
    if (!std || !std[slot]) return null;
    const ref = primary(mode, 'default');
    const base = ref && ref.entries.get(name);
    const mine = model.entries.get(name);
    return base && mine && sameSlot(base[slot], mine[slot]) ? std[slot] : null;
  }

  function dtmEdit(model, mode, variant, i) {
    const d = model.dtm[i];
    const match = (ref) => {
      const b = ref && ref.dtm[i];
      return ref === model || (b && d && b.color === d.color && b.height === d.height && b.resolution === d.resolution);
    };
    const own = editsOf(mode, variant).dtm[i];
    if (own && match(primary(mode, variant))) return own;
    if (variant === 'default') return null;
    const std = editsOf(mode, 'default').dtm[i];
    return std && match(primary(mode, 'default')) ? std : null;
  }

  function tuningEdit(model, mode, variant, name) {
    const match = (ref) => ref === model || (ref && ref.tuning.get(name) === model.tuning.get(name));
    const own = editsOf(mode, variant).tuning[name];
    if (own != null && match(primary(mode, variant))) return own;
    if (variant === 'default') return null;
    const std = editsOf(mode, 'default').tuning[name];
    return std != null && match(primary(mode, 'default')) ? std : null;
  }

  function entry(name) {
    const model = primary();
    const base = model.entries.get(name);
    if (!base || state.compare) return base;
    const pen = slotEdit(model, state.mode, state.variant, name, 'pen');
    const brush = slotEdit(model, state.mode, state.variant, name, 'brush');
    if (!pen && !brush) return base;
    return { name, pattern: base.pattern, pen: pen || base.pen, brush: brush || base.brush };
  }

  function baseEntry(name) {
    return primary().entries.get(name);
  }

  function setEntrySlot(name, slot, value) {
    const base = baseEntry(name);
    if (!base) return;
    const map = editsOf(state.mode, state.variant).entries;
    const cur = map[name] || {};
    // Going back to the original only needs no edit, unless the Standard map's
    // edit would otherwise show through.
    const inherited = inheritedSlot(primary(), state.mode, state.variant, name, slot);
    if (sameSlot(base[slot], value) && !inherited) delete cur[slot];
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
    const own = editsOf(state.mode, state.variant).entries;
    for (const n of names) delete own[n];
    commitEdit();
    schedule();
  }

  function isEdited(name) {
    const model = primary();
    return !state.compare && model.entries.has(name) && entry(name) !== model.entries.get(name);
  }

  function hasOwnEdit(name) {
    return !!editsOf(state.mode, state.variant).entries[name];
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

  function restoreSnapshot(snapshot) {
    state.edits = snapshot;
    persist();
    editor.render();
    schedule();
    updateChrome();
  }

  function undo() {
    commitPending();
    const prev = state.history.pop();
    if (!prev) return;
    state.future.push(clone(state.edits));
    restoreSnapshot(prev);
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(clone(state.edits));
    restoreSnapshot(next);
  }

  function countEdits(all = state.edits) {
    let n = 0;
    for (const byVariant of Object.values(all)) {
      for (const e of Object.values(byVariant)) n += Object.keys(e.entries).length + Object.keys(e.dtm).length + Object.keys(e.tuning).length;
    }
    return n;
  }

  function persist() {
    if (countEdits()) store.set(STORE_KEY + state.source, state.edits);
    else store.remove(STORE_KEY + state.source);
  }
  let persistTimer = null;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 500);
  }

  // Edits saved in this browser for the style on screen. Only the first load
  // mentions them; switching styles just brings each style's edits back.
  let announcedRestore = false;
  function restoreEdits() {
    const announce = !announcedRestore;
    announcedRestore = true;
    const saved = store.get(STORE_KEY + state.source);
    state.history = [];
    state.future = [];
    state.edits = { day: {}, night: {} };
    if (saved && typeof saved === 'object') {
      for (const mode of ['day', 'night']) {
        for (const [variant, e] of Object.entries(saved[mode] || {})) state.edits[mode][variant] = Object.assign(emptyEdits(), e);
      }
      const n = countEdits();
      if (n && announce) setTimeout(() => toast(`Restored ${n} unsaved ${n === 1 ? 'change' : 'changes'} from your last visit.`), 300);
    }
  }

  // ---- export / import --------------------------------------------------------

  // Everything that changes in one file: its map type's own edits where it had
  // the edited value, and Standard-map edits where it matched the Standard map.
  function editsForFile(f) {
    const out = emptyEdits();
    for (const name of f.model.entries.keys()) {
      const pen = slotEdit(f.model, f.mode, f.variant, name, 'pen');
      const brush = slotEdit(f.model, f.mode, f.variant, name, 'brush');
      if (pen || brush) out.entries[name] = Object.assign({}, pen && { pen }, brush && { brush });
    }
    f.model.dtm.forEach((_, i) => {
      const hex = dtmEdit(f.model, f.mode, f.variant, i);
      if (hex) out.dtm[i] = hex;
    });
    for (const name of f.model.tuning.keys()) {
      const v = tuningEdit(f.model, f.mode, f.variant, name);
      if (v != null) out.tuning[name] = v;
    }
    return out;
  }

  async function exportZip() {
    commitPending();
    const plain = $('#export-plain').checked;
    const files = [];
    let touched = 0;
    for (const f of state.files) {
      const fileEdits = editsForFile(f);
      if (Object.keys(fileEdits.entries).length || Object.keys(fileEdits.dtm).length || Object.keys(fileEdits.tuning).length) touched += 1;
      let data = encodeText(MIB.mxf.serialize(f.model, fileEdits));
      let path = f.path;
      // Keep each file as it came (gzipped stock files stay .mxf.gz), so the
      // names match the files on the head unit and replace them.
      if (f.gz && !plain) {
        data = await gzip(data);
        path += '.gz';
      }
      files.push({ path, data });
    }
    const changed = countEdits();
    files.push({
      path: 'README.txt',
      data: encodeText(
        [
          `MapConfigs exported from the MIB2 Map Style Lab (previewer/ in mib2-maps) for ${state.set.name}.`,
          '',
          `${changed} colour ${changed === 1 ? 'change' : 'changes'}, written to ${touched} of ${state.files.length} files. Day files end in _0, night files in _1.`,
          'Only colour, visibility and display-tuning values differ from the files you started with,',
          'and the file names match the originals.',
          '',
          'To try it on the car, unzip this and run utilities/deploy_scp.ps1 -mapConfigs <unzipped folder>,',
          'or copy the MapConfigs folder over the one in the map style folder these files came from',
          'on the head unit. Back up the original first.',
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
      version: 2,
      styleSet: state.set.id,
      note: 'Colours use #RRGGBBAA. "outline" is the pen colour and "fill" the brush colour, as in mib2-mapbuilder. Each mode lists its map types: default (standard), sat, traffic.',
      day: {},
      night: {},
    };
    for (const mode of ['day', 'night']) {
      for (const [variant, e] of Object.entries(state.edits[mode])) {
        const model = primary(mode, variant);
        if (model && (Object.keys(e.entries).length || Object.keys(e.dtm).length || Object.keys(e.tuning).length)) theme[mode][variant] = themeSection(e, model);
      }
    }
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    await save(`${state.set.id}-map-theme.json`, blob);
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
      if (!section || !model) return out;
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
    const next = { day: {}, night: {} };
    if (Array.isArray(data)) {
      // A bare mib2-mapbuilder colour list: apply it to what's on screen.
      next[state.mode][state.variant] = read(data, primary());
    } else if (data && (data.day || data.night)) {
      for (const mode of ['day', 'night']) {
        const section = data[mode];
        if (!section) continue;
        // Version 1 themes held one map type per mode.
        const byVariant = section.colours || Array.isArray(section) ? { default: section } : section;
        for (const [variant, s] of Object.entries(byVariant)) {
          if (VARIANTS.includes(variant) && primary(mode, variant)) next[mode][variant] = read(s, primary(mode, variant));
        }
      }
    } else {
      toast('This JSON has no "day" or "night" colours. Choose a theme exported from this page.', true);
      return;
    }
    beginEdit();
    state.edits = next;
    commitEdit();
    editor.render();
    schedule();
    const n = countEdits();
    toast(`Imported a theme with ${n} ${n === 1 ? 'change' : 'changes'}.`);
  }

  function resetAll() {
    beginEdit();
    state.edits = { day: {}, night: {} };
    commitEdit();
    editor.render();
    schedule();
    toast('All colours are back to the originals. Undo brings your changes back.');
  }

  // ---- map styles -----------------------------------------------------------------

  function renderPicker() {
    const picker = $('#style-set');
    const current = state.style ? state.style.key : STYLE_SETS[0].id;
    const groups = STYLE_SETS.map((set) =>
      el(
        'optgroup',
        { label: set.name },
        allStyles()
          .filter((s) => s.set === set)
          .map((s) => el('option', { value: s.key, text: s.kind === 'draft' ? `${s.name} (draft)` : s.name }))
      )
    );
    if (state.style && state.style.kind === 'custom') groups.unshift(el('option', { value: current, text: 'Your files', disabled: true }));
    picker.replaceChildren(...groups);
    picker.value = current;
  }

  // Packs the style on screen as a folder for mapstyles-alt/, with an
  // index.json that lists it beside the styles already there.
  async function exportStyle() {
    const style = state.style;
    if (!style || style.kind === 'stock' || style.kind === 'custom') {
      openStyleDialog('create', { thenExport: true });
      return;
    }
    commitPending();
    const meta = style.kind === 'alt' ? style.alt : style.draft;
    const entry = { id: meta.id, name: meta.name, description: meta.description || '', base: state.set.id };
    const index = MIB.library.indexWith(state.alts, entry);
    const files = [{ path: 'index.json', data: encodeText(`${JSON.stringify(index, null, 2)}\n`) }];
    for (const f of state.files) {
      let data = encodeText(MIB.mxf.serialize(f.model, editsForFile(f)));
      let path = `${meta.id}/${f.path}`;
      if (f.gz) {
        data = await gzip(data);
        path += '.gz';
      }
      files.push({ path, data });
    }
    await save(`${meta.id}.zip`, await makeZip(files));
    toast(`Unzip ${meta.id}.zip into ${ALT_DIR} (it replaces index.json) to add “${meta.name}” to the style picker.`);
  }

  let dialogMode = null;
  let dialogThen = null;

  function openStyleDialog(mode, opts = {}) {
    const dialog = $('#style-dialog');
    if (mode === 'create' && state.style && state.style.kind === 'custom') {
      toast('New styles start from a stock or alternate style. Use Back to stock files, or put your files in a mapstyles-alt/ folder.', true);
      return;
    }
    dialogMode = mode;
    dialogThen = opts.thenExport ? exportStyle : null;
    const draft = mode === 'edit' && state.style.kind === 'draft' ? state.style.draft : null;
    const from = state.style ? state.style.name : 'the stock styles';
    $('#style-dialog-title').textContent = draft ? 'Style details' : 'New map style';
    $('[data-dialog-intro]').textContent = draft
      ? 'Rename the draft or change its description. Its folder name stays the same.'
      : `Starts from ${from}, including any changes on screen. The new style is kept in this browser; use Export → Map style folder to add it to ${ALT_DIR}.`;
    $('#style-name').value = draft ? draft.name : '';
    $('#style-desc').value = draft ? draft.description || '' : '';
    $('#style-save').textContent = draft ? 'Save' : opts.thenExport ? 'Create and export' : 'Create style';
    const del = $('#style-delete');
    del.hidden = !draft;
    del.textContent = 'Delete draft';
    del.dataset.armed = '';
    updateFolderNote();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    $('#style-name').focus();
  }

  function takenIds() {
    return new Set([...state.alts.map((a) => a.id), ...state.drafts.map((d) => d.id)]);
  }

  function updateFolderNote() {
    const draft = dialogMode === 'edit' && state.style.kind === 'draft' ? state.style.draft : null;
    const id = draft ? draft.id : MIB.library.folderName($('#style-name').value, takenIds());
    $('[data-dialog-folder]').textContent = `Folder: ${ALT_DIR}${id}/`;
  }

  function closeStyleDialog() {
    const dialog = $('#style-dialog');
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function wireStyleDialog() {
    $('#style-name').addEventListener('input', updateFolderNote);
    $('#style-cancel').addEventListener('click', closeStyleDialog);
    $('#style-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#style-name').value.trim();
      const description = $('#style-desc').value.trim();
      if (!name) {
        $('#style-name').focus();
        return;
      }
      if (dialogMode === 'edit' && state.style.kind === 'draft') {
        const draft = state.drafts.find((d) => d.id === state.style.draft.id);
        Object.assign(draft, { name, description });
        MIB.library.saveDrafts(state.drafts);
        state.style = styleByKey(state.style.key);
        closeStyleDialog();
        updateChrome();
        toast(`Saved “${name}”.`);
        return;
      }
      commitPending();
      // The draft starts with the files and changes on screen.
      const from = state.style && state.style.kind === 'draft' ? state.style.draft.from : state.style && state.style.kind !== 'custom' ? state.style.key : state.set.id;
      const draft = { id: MIB.library.folderName(name, takenIds()), name, description, base: state.set.id, from, created: new Date().toISOString() };
      state.drafts.push(draft);
      MIB.library.saveDrafts(state.drafts);
      if (countEdits()) store.set(STORE_KEY + `draft:${draft.id}`, state.edits);
      const then = dialogThen;
      closeStyleDialog();
      await useStyle(`draft:${draft.id}`);
      toast(`Created “${name}”. It's kept in this browser until you export it as a map style folder.`);
      if (then) then();
    });
    $('#style-delete').addEventListener('click', async () => {
      const del = $('#style-delete');
      // Two clicks: the first asks, the second deletes.
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'Click again to delete it and its changes';
        return;
      }
      const draft = state.style.draft;
      state.drafts = state.drafts.filter((d) => d.id !== draft.id);
      MIB.library.saveDrafts(state.drafts);
      store.remove(STORE_KEY + `draft:${draft.id}`);
      closeStyleDialog();
      await useStyle(styleByKey(draft.from) ? draft.from : state.set.id);
      toast(`Deleted the draft “${draft.name}”.`);
    });
  }

  // ---- preview ------------------------------------------------------------------

  function routeNames() {
    const t = state.view.routeType;
    return [`route_${t}_active_subtour_1`, `route_${t}_active_subtour_2`, `route_${t}_waypoint_route_manual_marker`];
  }

  function inScene(name) {
    if (MIB.scene.drawn.has(name)) return true;
    if (routeNames().includes(name)) return true;
    if (state.variant === 'sat' && /^satcopyright_/.test(name)) return true;
    return MIB.scene.events.some((ev) => `tmc_${ev.event}_${ev.side}` === name);
  }

  function styleFor() {
    const model = primary();
    const { mode, variant } = state;
    return {
      model,
      fontDefs: state.fontDefs,
      entry,
      tuning: (n) => {
        const v = state.compare ? null : tuningEdit(model, mode, variant, n);
        return v != null ? v : model.tuning.get(n);
      },
      dtm: () => (state.compare ? model.dtm : model.dtm.map((d, i) => Object.assign({}, d, { color: dtmEdit(model, mode, variant, i) || d.color }))),
    };
  }

  function zoomLevels() {
    const levels = state.zoomBy[state.screen] || FALLBACK_ZOOM;
    return levels.filter((z) => z.resolution <= MAX_PREVIEW_RES);
  }

  // Zoom is kept as the scale-bar distance, so it survives switching screens.
  function zoomIndex() {
    const levels = zoomLevels();
    let best = 0;
    levels.forEach((z, i) => {
      if (Math.abs(Math.log(z.metres / state.view.metres)) < Math.abs(Math.log(levels[best].metres / state.view.metres))) best = i;
    });
    return best;
  }

  function viewFor() {
    const z = zoomLevels()[zoomIndex()];
    const [w, h] = currentScreen().size;
    return Object.assign({}, state.view, { res: z.resolution, tilt: z.tilt, screenW: w, screenH: h, satellite: state.variant === 'sat' });
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!state.files.length || !primary()) return;
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
    const levels = state.zoomBy[state.screen] || FALLBACK_ZOOM;
    let best = levels[0];
    for (const z of levels) if (z.resolution <= res * 1.02) best = z;
    return res <= levels[0].resolution ? 'all zooms' : `${zoomLabel(best.metres)} and out`;
  }

  function updateScreenChrome() {
    const z = zoomLevels()[zoomIndex()];
    const [w] = currentScreen().size;
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
    // VW screens include the status bar; the Audi map area sits below it.
    $('.hu-status').hidden = !currentScreen().statusBar;
    const stage = $('.stage');
    stage.dataset.mode = state.mode;
    stage.classList.toggle('is-comparing', state.compare);
  }

  function segButtons(container, items, current, onPick) {
    container.replaceChildren(
      ...items.map((it) => {
        const b = el('button', { type: 'button', 'aria-pressed': String(it.id === current), text: it.label, disabled: it.disabled });
        b.addEventListener('click', () => onPick(it.id));
        return b;
      })
    );
    container.hidden = items.length < 2;
  }

  function updateChrome() {
    $('#export-toggle').disabled = !state.files.length;
    $('#undo').disabled = !state.history.length && !state.pending;
    $('#redo').disabled = !state.future.length;
    const n = countEdits();
    $('[data-edit-count]').textContent = n ? `${n} ${n === 1 ? 'change' : 'changes'}` : 'No changes yet';
    const style = state.style || { kind: 'stock' };
    const count = state.files.length;
    const days = state.files.filter((f) => f.mode === 'day').length;
    const source = $('[data-source]');
    if (style.kind === 'custom') source.textContent = `Your files · ${count} MapConfig ${count === 1 ? 'file' : 'files'} (${days} day, ${count - days} night)`;
    else if (style.kind === 'alt') source.textContent = `${ALT_DIR}${style.alt.id}/${style.alt.description ? ` · ${style.alt.description}` : ''}`;
    else if (style.kind === 'draft') {
      const from = styleByKey(style.draft.from);
      source.textContent = `Draft in this browser, started from ${from ? from.name : 'the stock styles'}${style.draft.description ? ` · ${style.draft.description}` : ''}`;
    } else source.textContent = `Stock styles from ${state.set.dir}MapConfigs · ${count} files`;
    source.title = source.textContent;
    $('#back-to-stock').hidden = style.kind !== 'custom';
    renderPicker();
    $('#style-details').hidden = style.kind !== 'draft';
    for (const b of document.querySelectorAll('[data-set-mode]')) {
      b.setAttribute('aria-pressed', String(b.dataset.setMode === state.mode));
      b.disabled = !state.files.some((f) => f.mode === b.dataset.setMode);
    }
    segButtons(
      $('#map-type'),
      variantsFor(state.mode).map((v) => ({ id: v, label: VARIANT_LABELS[v] })),
      state.variant,
      (v) => {
        commitPending();
        state.variant = v;
        if (v === 'traffic') {
          state.view.traffic = true;
          $('#layer-traffic').checked = true;
        }
        afterSourceChange();
      }
    );
    segButtons(
      $('#screen-seg'),
      availableScreens().map((s) => ({ id: s.id, label: s.label })),
      state.screen,
      (id) => {
        state.screen = id;
        afterSourceChange();
      }
    );
    for (const b of document.querySelectorAll('[data-set-dim]')) b.setAttribute('aria-pressed', String((b.dataset.setDim === '3d') === state.view.threeD));
    const levels = zoomLevels();
    $('#zoom-in').disabled = zoomIndex() === 0;
    $('#zoom-out').disabled = zoomIndex() === levels.length - 1;
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

  function variantNote() {
    if (state.variant === 'default' || !variantsFor(state.mode).includes('default')) return null;
    return `${VARIANT_LABELS[state.variant]} map: colours you change on the Standard map also apply here wherever both maps used the same colour. Changes made here apply to the ${VARIANT_LABELS[state.variant].toLowerCase()} map only.`;
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
    const levels = zoomLevels();
    state.view.metres = levels[Math.max(0, Math.min(levels.length - 1, i))].metres;
    updateChrome();
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
    let wheelLock = false;

    const local = (e) => {
      const r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const worldAt = (X, Y) => {
      const [px, py] = renderer.fromScreen(X, Y);
      return renderer.fromCanvas(px, py);
    };

    host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !renderer.L) return;
      host.setPointerCapture(e.pointerId);
      const [X, Y] = local(e);
      drag = { X, Y, start: worldAt(X, Y), cx: state.view.cx, cy: state.view.cy, moved: false };
    });
    host.addEventListener('pointermove', (e) => {
      if (!renderer.L) return;
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
        if (!Number.isFinite(now[0]) || Y < renderer.L.Ytop + 8) return;
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
        setZoom(zoomIndex() + (e.deltaY > 0 ? 1 : -1));
      },
      { passive: false }
    );
    host.addEventListener('dblclick', () => setZoom(zoomIndex() - 1));
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
    const picker = $('#style-set');
    picker.addEventListener('change', async () => {
      if (!(await useStyle(picker.value))) renderPicker();
    });
    $('#new-style').addEventListener('click', () => openStyleDialog('create'));
    $('#style-details').addEventListener('click', () => openStyleDialog('edit'));
    wireStyleDialog();
    for (const b of document.querySelectorAll('[data-set-mode]')) {
      b.addEventListener('click', () => {
        commitPending();
        state.mode = b.dataset.setMode;
        pickAvailable();
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
    $('#zoom-in').addEventListener('click', () => setZoom(zoomIndex() - 1));
    $('#zoom-out').addEventListener('click', () => setZoom(zoomIndex() + 1));
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
    $('#back-to-stock').addEventListener('click', () => useStyle(store.get(LAST_STYLE_KEY) || state.set.id));

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
    $('#export-zip').addEventListener('click', () => {
      close();
      exportZip();
    });
    $('#export-theme').addEventListener('click', () => {
      close();
      exportTheme();
    });
    $('#export-style').addEventListener('click', () => {
      close();
      exportStyle();
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
      isEdited,
      hasOwnEdit,
      isEditedAny: (key) => Object.keys(editsOf(state.mode, state.variant)[key]).length > 0,
      isDtmEdited: (i) => !state.compare && dtmEdit(primary(), state.mode, state.variant, i) != null,
      isTuningEdited: (n) => tuningEdit(primary(), state.mode, state.variant, n) != null,
      variantNote,
      setSlot,
      reset: resetNames,
      beginEdit,
      commitEdit,
      dtm: () => styleFor().dtm(),
      // As with colours: going back to the original needs no edit, unless a
      // Standard-map edit would otherwise show through.
      setDtm: (i, hex) => {
        const own = editsOf(state.mode, state.variant).dtm;
        delete own[i];
        const inherited = dtmEdit(primary(), state.mode, state.variant, i);
        const base = primary().dtm[i];
        if (!(base && base.color === hex && !inherited)) own[i] = hex;
        schedule();
        persistSoon();
      },
      tuning: (n) => styleFor().tuning(n),
      setTuning: (n, v) => {
        const own = editsOf(state.mode, state.variant).tuning;
        delete own[n];
        const inherited = tuningEdit(primary(), state.mode, state.variant, n);
        if (!(primary().tuning.get(n) === String(v) && inherited == null)) own[n] = String(v);
        schedule();
        persistSoon();
      },
      zoomLabelFor,
    });
    wireToolbar();
    wireStage();
    recentre();

    $('.stage').classList.remove('is-loading');
    state.drafts = MIB.library.drafts();
    state.alts = await loadIndex();
    const last = store.get(LAST_STYLE_KEY);
    let ok = await useStyle(last && styleByKey(last) ? last : STYLE_SETS[0].id);
    if (!ok && last) ok = await useStyle(STYLE_SETS[0].id);
    if (!ok) {
      $('#export-toggle').disabled = true;
      $('.stage').classList.add('is-empty');
      $('[data-source]').textContent = 'Open your MapConfig files to start';
      $('[data-list]').replaceChildren(
        el('p', { class: 'empty' }, [
          'The stock styles could not be loaded. This happens when the page is opened straight from disk. Open the .mxf or .mxf.gz files from a MapConfigs folder with ',
          el('strong', { text: 'Open files' }),
          ', or serve the repository folder (for example ',
          el('code', { text: 'npx http-server' }),
          ') and open /previewer/.',
        ])
      );
      return;
    }
    setInterval(updateScreenChrome, 30000);
  }

  // Labels use the fonts named in the set's font config, from its Font folder.
  function loadLabelFonts(set, loaded) {
    if (document.fonts) document.fonts.ready.then(schedule);
    if (!('FontFace' in window) || window.MIB_LABEL_FONTS === false || !loaded.fontDefs) return;
    const seen = new Set();
    const loads = [];
    for (const def of loaded.fontDefs.values()) {
      const key = `${def.face}|${def.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const face = new FontFace(def.face, `url("${loaded.root}${set.dir}${def.path}")`, { weight: String(MIB.mxf.fontWeight(def.path)) });
      loads.push(
        face.load().then(
          (f) => document.fonts.add(f),
          () => null /* not available here: labels use the fallback stack */
        )
      );
    }
    Promise.all(loads).then(schedule);
  }

  // For poking at the previewer from the browser console.
  MIB.debug = { state, get renderer() { return renderer; }, schedule, editsForFile };

  document.addEventListener('DOMContentLoaded', boot);
})((window.MIB = window.MIB || {}));
