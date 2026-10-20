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

  MIB.library = { ALT_DIR, parseIndex, indexWith, drafts, saveDrafts, folderName };
})((window.MIB = window.MIB || {}));
