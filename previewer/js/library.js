// Alternate map styles: the ones kept in mapstyles-alt/ (listed in its
// index.json) and drafts made in this browser with "New style".
(function (MIB) {
  'use strict';
  const { store } = MIB.util;

  const ALT_DIR = 'mapstyles-alt/';
  const DRAFTS_KEY = 'mib2-style-lab:drafts';
  const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

  // index.json is { "styles": [{ id, name, description, base, files? }] }.
  // `base` names the stock set the style is built on ("audi" or "vw"), and
  // `files` lists the MapConfig files in the style's folder when it only
  // replaces some of them; the rest come from the stock set.
  function parseIndex(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && data.styles;
    if (!Array.isArray(list)) throw new Error('mapstyles-alt/index.json has no "styles" list.');
    return list
      .filter((s) => s && typeof s.id === 'string' && ID_PATTERN.test(s.id) && typeof s.base === 'string')
      .map((s) => ({
        id: s.id,
        name: String(s.name || s.id),
        description: s.description ? String(s.description) : '',
        base: s.base,
        files: Array.isArray(s.files) ? s.files.map(String) : null,
      }));
  }

  // The index with `entry` added, or replacing the style with the same id.
  function indexWith(styles, entry) {
    const out = styles.map((s) => {
      const keep = { id: s.id, name: s.name, description: s.description, base: s.base };
      if (s.files) keep.files = s.files;
      return s.id === entry.id ? entry : keep;
    });
    if (!out.some((s) => s.id === entry.id)) out.push(entry);
    return { styles: out };
  }

  function drafts() {
    const list = store.get(DRAFTS_KEY);
    return Array.isArray(list) ? list.filter((d) => d && ID_PATTERN.test(d.id || '')) : [];
  }

  function saveDrafts(list) {
    store.set(DRAFTS_KEY, list);
  }

  // A folder name for mapstyles-alt/ from a style name, e.g. "Night Blue" -> "night-blue".
  function folderName(name, taken) {
    const base =
      String(name || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'style';
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  // The navigation uses whichever copy of the map style has the highest version
  // in its version-cfg.txt: the one on the head unit, the one in the map
  // database, or (with the LoadStylesFromSDCard flag) one in the root of an SD
  // card. A style for the car gets a version above any stock one, so it wins:
  // "10.0.2811" becomes "10.0.9999".
  const RAISED_PATCH = 9999;

  function raisedVersion(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const m = /^\s*(\d+)\.(\d+)\.(\d+)/.exec(String(text || ''));
    if (!m) return `10.0.${RAISED_PATCH}${eol}`;
    return `${m[1]}.${m[2]}.${Math.max(RAISED_PATCH, +m[3] + 1)}${eol}`;
  }

  // The top-level items of a map style folder (VW and Audi). Writing a style
  // to an SD card replaces these in the card's root and leaves everything else.
  const STYLE_ITEMS = [
    'amzoomconfig.xml',
    'amzoomconfig.1.xml',
    'amzoomconfig_1280x640.xml',
    'commit.txt',
    'exitview',
    'Font',
    'gui',
    'guidanceview',
    'HUD',
    'images.cff',
    'intersectionmap',
    'MapConfigs',
    'Models',
    'pcconfig',
    'poi',
    'res',
    'resourceConfig.xml',
    'revision.txt',
    'roadicon',
    'signpost',
    'sky',
    'textures',
    'tti',
    'version-cfg.txt',
  ];
  // SD cards are FAT32, where names ignore case.
  const isStyleItem = (name) => STYLE_ITEMS.some((item) => item.toLowerCase() === String(name).toLowerCase());

  // The style items in a folder about to get a style, or an error when the
  // folder has items with those names but no style (so it isn't the SD card's
  // root, and replacing them would delete someone's files).
  function styleItemsToReplace(names) {
    const items = names.filter(isStyleItem);
    const holdsStyle = names.some((n) => /^(version-cfg\.txt|mapconfigs)$/i.test(n));
    if (items.length && !holdsStyle) {
      return { error: `It has ${items.join(', ')} but no map style, so it doesn't look like the SD card's root folder. Pick the card itself, empty or with a map style on it.` };
    }
    return { items };
  }

  MIB.library = { ALT_DIR, parseIndex, indexWith, drafts, saveDrafts, folderName, raisedVersion, STYLE_ITEMS, isStyleItem, styleItemsToReplace };
})((window.MIB = window.MIB || {}));
