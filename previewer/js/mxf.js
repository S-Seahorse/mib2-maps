// Reading and writing MIB2 MapConfig (.mxf) files.
//
// The parser reads the parts the previewer needs: colours (drawingconfiguration),
// road widths (sizeconfiguration), zoom ranges (visibilityconfiguration), label
// fonts, the terrain colour map and the display tuning factors. Writing goes back
// through the original text and only rewrites the attributes that were edited,
// so everything else in the file stays byte-for-byte the same.
(function (MIB) {
  'use strict';
  const { dcToHex, hexToDc } = MIB.util;

  const attrs = (text) => {
    const out = {};
    text.replace(/([a-zA-Z_][\w-]*)="([^"]*)"/g, (_, k, v) => {
      out[k] = v;
    });
    return out;
  };

  function parseSlot(block) {
    if (!block) return null;
    const colour = /dccolor="(0x[0-9A-Fa-f]{1,8})"/.exec(block);
    const style = /<style\s+type="([a-zA-Z]+)"/.exec(block);
    return { color: colour ? dcToHex(colour[1]) : '#000000FF', style: style ? style[1] : 'solid' };
  }

  function parse(text, fileName) {
    const nameMatch = /<mapconfig\s+name="([^"]+)"/.exec(text);
    const model = {
      text,
      fileName: fileName || '',
      configName: nameMatch ? nameMatch[1] : '',
      entries: new Map(),
      sizes: new Map(),
      visibility: new Map(),
      fonts: [],
      dtm: [],
      tuning: new Map(),
      patterns: new Map(),
    };

    for (const m of text.matchAll(/<drawingconfiguration\s+name="([^"]+)"\s*>([\s\S]*?)<\/drawingconfiguration>/g)) {
      const body = m[2];
      const pen = parseSlot((/<pen>([\s\S]*?)<\/pen>/.exec(body) || [])[1]);
      const brush = parseSlot((/<brush>([\s\S]*?)<\/brush>/.exec(body) || [])[1]);
      const pattern = /<pattern\s+id="(\d+)"/.exec(body);
      model.entries.set(m[1], { name: m[1], pen, brush, pattern: pattern ? +pattern[1] : null });
    }

    for (const m of text.matchAll(/<sizeconfiguration\s+name="([^"]+)"\s*>([\s\S]*?)<\/sizeconfiguration>/g)) {
      const rows = [];
      for (const r of m[2].matchAll(/<size\s([^>]*?)\/?>/g)) {
        const a = attrs(r[1]);
        rows.push({
          resolution: +a.resolution || 0,
          lane: (+a.lanewidth || 0) / 256,
          border: (+a.borderwidth || 0) / 256,
          highlight: (+a.highlightwidth || 0) / 256,
        });
      }
      rows.sort((x, y) => x.resolution - y.resolution);
      model.sizes.set(m[1], rows);
    }

    for (const m of text.matchAll(/<visibilityconfiguration\s+name="([^"]+)"\s*>\s*<min\s+resolution="(-?\d+)"\s*\/>\s*<max\s+resolution="(-?\d+)"/g)) {
      model.visibility.set(m[1], { min: +m[2], max: +m[3] });
    }

    for (const m of text.matchAll(/<font\s([^>]*?)\/>/g)) {
      const a = attrs(m[1]);
      model.fonts.push({ type: a.type, id: +a.id, size: a.size != null ? +a.size : null, outline: +a.outline_width || 0 });
    }

    for (const m of text.matchAll(/<dtmheightcolor\s([^>]*?)\/>/g)) {
      const a = attrs(m[1]);
      model.dtm.push({ height: +a.height, color: dcToHex(a.color), resolution: +a.resolution || 0 });
    }

    for (const m of text.matchAll(/<tuning\s+name="([^"]+)"\s+value="([^"]*)"/g)) {
      model.tuning.set(m[1], m[2]);
    }

    for (const m of text.matchAll(/<patternconfiguration\s+id="(\d+)"\s*>([\s\S]*?)<\/patternconfiguration>/g)) {
      const get = (tag) => {
        const r = new RegExp(`<${tag}\\s+(?:val|type)="([^"]*)"`).exec(m[2]);
        return r ? r[1] : null;
      };
      model.patterns.set(+m[1], { scale: +get('scale') || 10, stroke: +get('stroke') || 3, direction: get('direction') });
    }

    if (!model.entries.size) {
      throw new Error(`${fileName || 'This file'} has no colour entries. Pick a MapConfig file such as mapconfig_default_0_DTM.mxf.`);
    }
    return model;
  }

  // Edits are { entries: {name: {pen?: {color, style}, brush?: {...}}}, dtm: {index: hex}, tuning: {name: value} }.
  function serialize(model, edits) {
    const entries = (edits && edits.entries) || {};
    const dtm = (edits && edits.dtm) || {};
    const tuning = (edits && edits.tuning) || {};
    let text = model.text;

    const rewriteSlot = (block, tag, slot) => {
      if (!slot) return block;
      return block.replace(new RegExp(`(<${tag}>[\\s\\S]*?<\\/${tag}>)`), (part) =>
        part
          .replace(/(dccolor=")(0x[0-9A-Fa-f]{1,8})(")/, (_, a, __, c) => a + hexToDc(slot.color) + c)
          .replace(/(<style\s+type=")([a-zA-Z]+)(")/, (_, a, __, c) => a + slot.style + c)
      );
    };

    if (Object.keys(entries).length) {
      text = text.replace(/(<drawingconfiguration\s+name="([^"]+)"\s*>)([\s\S]*?)(<\/drawingconfiguration>)/g, (whole, open, name, body, close) => {
        const e = entries[name];
        if (!e) return whole;
        return open + rewriteSlot(rewriteSlot(body, 'pen', e.pen), 'brush', e.brush) + close;
      });
    }

    if (Object.keys(dtm).length) {
      let i = -1;
      text = text.replace(/<dtmheightcolor\s[^>]*?\/>/g, (tag) => {
        i += 1;
        const hex = dtm[i];
        return hex ? tag.replace(/(color=")(0x[0-9A-Fa-f]{1,8})(")/, (_, a, __, c) => a + hexToDc(hex) + c) : tag;
      });
    }

    for (const [name, value] of Object.entries(tuning)) {
      const re = new RegExp(`(<tuning\\s+name="${name}"\\s+value=")([^"]*)(")`);
      text = text.replace(re, (_, a, __, c) => a + value + c);
    }
    return text;
  }

  // mapconfig_default_0_DTM, mapconfig_default_kombi_1, ... : _0 is day, _1 is night.
  function modeFromName(name) {
    const m = /_([01])(?:_DTM)?(?:\.mxf)?(?:\.gz)?$/i.exec(name || '');
    if (!m) return null;
    return m[1] === '0' ? 'day' : 'night';
  }

  // Which map a config draws: the standard map, the labels and roads over
  // satellite imagery (Audi), the traffic map, or the instrument cluster (VW kombi).
  function variantFromName(name) {
    if (/_sat_/i.test(name || '')) return 'sat';
    if (/traffic/i.test(name || '')) return 'traffic';
    if (/kombi/i.test(name || '')) return 'kombi';
    return 'default';
  }

  // Font weight from a font file name, e.g. AudiTypeDisplayHighBold.ttf -> 700.
  function fontWeight(path) {
    if (/bold|semibold/i.test(path || '')) return 700;
    if (/light/i.test(path || '')) return 300;
    return 400;
  }

  // Font ids in the .mxf point at fontdefinitions in the font config
  // (fontconfig_default_0.fcx for VW, fontconfig_audi_0.fcx for Audi).
  function parseFontConfig(text) {
    const fonts = new Map();
    // Audi definitions also carry a <style> element before the font's <path>.
    for (const m of text.matchAll(/<fontdefinition\s([^>]*?)>([\s\S]*?)<\/fontdefinition>/g)) {
      const a = attrs(m[1]);
      const path = /<path\s+val="([^"]*)"/.exec(m[2]);
      if (path) fonts.set(+a.id, { face: a.face || '', size: +a.size || 16, path: path[1] });
    }
    return fonts;
  }

  // Zoom steps shown in the car (pcconfig/zoomlevel_instance0.xml): metres on
  // the scale bar and the matching resolution in metres per pixel.
  function parseZoomLevels(text) {
    const table = /<zoomleveltable\s+metricSystem="0">([\s\S]*?)<\/zoomleveltable>/.exec(text);
    const levels = [];
    if (!table) return levels;
    for (const m of table[1].matchAll(/<zoomlevel\s+resolution="([\d.]+)"\s+tiltangle="([\d.]+)"[\s\S]*?<display\s+hmi_value="(\d+)"/g)) {
      levels.push({ resolution: +m[1], tilt: +m[2], metres: +m[3] });
    }
    return levels;
  }

  MIB.mxf = { parse, serialize, modeFromName, variantFromName, fontWeight, parseFontConfig, parseZoomLevels };
})((window.MIB = window.MIB || {}));
