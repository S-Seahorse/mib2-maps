// Shared helpers: colour conversion, gzip, zip, saving files, browser storage.
// Every script in previewer/ is a classic script that adds to window.MIB, so the
// page also works when index.html is opened straight from disk.
(function (MIB) {
  'use strict';

  // ---- colours ------------------------------------------------------------
  // The .mxf files store colours as dccolor="0xAABBGGRR". The previewer works in
  // #RRGGBBAA, the same convention mib2-mapbuilder uses (see toVWColour.ts).

  function dcToHex(dc) {
    const s = String(dc).replace(/^0x/i, '').toUpperCase().padStart(8, '0');
    return '#' + s.slice(6, 8) + s.slice(4, 6) + s.slice(2, 4) + s.slice(0, 2);
  }

  function hexToDc(hex) {
    const h = normaliseHex(hex).slice(1);
    return '0x' + h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  }

  // Accepts #RGB, #RGBA, #RRGGBB or #RRGGBBAA (with or without #). Returns
  // #RRGGBBAA in upper case, or null when the text is not a colour.
  function normaliseHex(text) {
    let h = String(text || '').trim().replace(/^#/, '');
    if (!/^[0-9a-f]+$/i.test(h)) return null;
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'FF';
    if (h.length !== 8) return null;
    return '#' + h.toUpperCase();
  }

  function hexToRgba(hex) {
    const h = normaliseHex(hex).slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16),
    };
  }

  function rgbaToHex({ r, g, b, a }) {
    const p = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return ('#' + p(r) + p(g) + p(b) + p(a)).toUpperCase();
  }

  function cssColour(hex, alphaScale) {
    const c = hexToRgba(hex);
    const a = (c.a / 255) * (alphaScale == null ? 1 : alphaScale);
    return `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`;
  }

  // ---- bytes --------------------------------------------------------------

  const isGzip = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  async function streamThrough(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  // Servers sometimes decompress .gz on the way (Content-Encoding), so only
  // gunzip when the gzip magic number is really there.
  async function gunzipIfNeeded(bytes) {
    if (!isGzip(bytes)) return bytes;
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot unpack .gz files. Unpack the file first, or use a current Chrome, Edge, Firefox or Safari.');
    }
    return streamThrough(bytes, new DecompressionStream('gzip'));
  }

  async function gzip(bytes) {
    return streamThrough(bytes, new CompressionStream('gzip'));
  }

  const canGzip = () => typeof CompressionStream !== 'undefined';

  // The stock files start with a UTF-8 byte order mark; keep it so an exported
  // file differs from the original only where a colour changed.
  const decodeText = (bytes) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  const encodeText = (text) => new TextEncoder().encode(text);

  // ---- zip ----------------------------------------------------------------
  // A small zip writer: deflate when the browser has CompressionStream,
  // otherwise store. Enough for a folder of map configs.

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function makeZip(files) {
    const deflate = typeof CompressionStream !== 'undefined';
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const name = encodeText(file.path);
      const raw = file.data;
      const body = deflate ? await streamThrough(raw, new CompressionStream('deflate-raw')) : raw;
      const crc = crc32(raw);
      const method = deflate ? 8 : 0;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, method, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, body.length, true);
      local.setUint32(22, raw.length, true);
      local.setUint16(26, name.length, true);
      parts.push(new Uint8Array(local.buffer), name, body);

      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, method, true);
      entry.setUint16(12, dosTime, true);
      entry.setUint16(14, dosDate, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, body.length, true);
      entry.setUint32(24, raw.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);

      offset += 30 + name.length + body.length;
    }

    const centralSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  // ---- saving -------------------------------------------------------------
  // Inside a claude.ai artifact, downloads go through the viewer's `downloads`
  // capability; everywhere else a plain download link does the job.

  let downloadsPromise = null;
  function artifactDownloads() {
    if (!downloadsPromise) {
      downloadsPromise =
        window.claude && typeof window.claude.use === 'function'
          ? window.claude.use('downloads').catch(() => null)
          : Promise.resolve(null);
    }
    return downloadsPromise;
  }

  async function saveFile(filename, blob) {
    const downloads = await artifactDownloads();
    const framed = !!(window.claude && typeof window.claude.use === 'function');
    if (downloads) {
      try {
        await downloads.save({ filename, data: blob });
        return 'saved';
      } catch (err) {
        if (err && err.code === 'declined') return 'declined';
        throw new Error(err && err.message ? err.message : 'The file could not be saved here.');
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    // Inside a viewer without the downloads capability a link may do nothing.
    return framed ? 'unsure' : 'saved';
  }

  // ---- storage ------------------------------------------------------------

  const store = {
    get(key) {
      try {
        const v = window.localStorage.getItem(key);
        return v == null ? null : JSON.parse(v);
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* private mode or storage full: edits just won't survive a reload */
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (_) {
        /* ignore */
      }
    },
  };

  // ---- misc ---------------------------------------------------------------

  // Deterministic pseudo-random numbers so the sample city is the same on every load.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  MIB.util = {
    dcToHex,
    hexToDc,
    normaliseHex,
    hexToRgba,
    rgbaToHex,
    cssColour,
    gunzipIfNeeded,
    gzip,
    canGzip,
    decodeText,
    encodeText,
    makeZip,
    saveFile,
    store,
    rng,
    el,
  };
})((window.MIB = window.MIB || {}));
