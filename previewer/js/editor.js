// The colour list beside the preview: groups of rows, a search box and filters,
// and an inspector that opens under the selected row.
(function (MIB) {
  'use strict';
  const { el, normaliseHex, hexToRgba, rgbaToHex } = MIB.util;

  const STYLE_LABELS = { solid: 'Shown', transparent: 'Hidden', pattern: 'Pattern' };

  function swatch(slot, label) {
    const b = el('button', { type: 'button', class: 'swatch', 'aria-label': label });
    paintSwatch(b, slot);
    return b;
  }

  function paintSwatch(node, slot) {
    if (!slot) return;
    const { r, g, b, a } = hexToRgba(slot.color);
    node.style.setProperty('--sw', `rgba(${r},${g},${b},${a / 255})`);
    node.classList.toggle('is-hidden', slot.style === 'transparent');
    node.classList.toggle('is-pattern', slot.style === 'pattern');
    node.title = `${slot.color}${slot.style !== 'solid' ? ` · ${STYLE_LABELS[slot.style] || slot.style}` : ''}`;
  }

  const sameSlot = (a, b) => a && b && a.color === b.color && a.style === b.style;

  class Editor {
    constructor(root, api) {
      this.root = root;
      this.api = api;
      this.filter = 'scene';
      this.query = '';
      this.open = null; // { rowId, member }
      this.collapsed = new Set(MIB.util.store.get('mib2-style-lab:collapsed') || []);
      this.list = root.querySelector('[data-list]');
      this.count = root.querySelector('[data-count]');
      const search = root.querySelector('#colour-search');
      search.addEventListener('input', () => {
        this.query = search.value.trim().toLowerCase();
        this.render();
      });
      for (const b of root.querySelectorAll('[data-filter]')) {
        b.addEventListener('click', () => {
          this.filter = b.dataset.filter;
          for (const o of root.querySelectorAll('[data-filter]')) o.setAttribute('aria-pressed', String(o === b));
          this.render();
        });
      }
    }

    rowVisible(row) {
      const api = this.api;
      if (this.filter === 'scene' && !row.members.some((n) => api.inScene(n))) return false;
      if (this.filter === 'changed' && !row.members.some((n) => api.isEdited(n))) return false;
      if (this.query) {
        const hay = `${row.label} ${row.sub || ''} ${row.members.join(' ')}`.toLowerCase();
        if (!hay.includes(this.query)) return false;
      }
      return true;
    }

    render() {
      const api = this.api;
      const groups = api.groups();
      const frag = document.createDocumentFragment();
      let shown = 0;
      for (const g of groups) {
        const rows = g.rows.filter((r) => this.rowVisible(r));
        if (!rows.length) continue;
        shown += rows.length;
        frag.append(this.renderGroup(g, rows));
      }
      if (this.filter !== 'changed' || api.isEditedAny('dtm')) {
        const t = this.renderTerrain();
        if (t) frag.append(t);
      }
      if (this.filter !== 'changed' || api.isEditedAny('tuning')) frag.append(this.renderTuning());
      const note = api.variantNote();
      if (note) frag.prepend(el('p', { class: 'note variant-note', text: note }));
      if (!shown && !this.query && this.filter === 'changed') {
        frag.append(el('p', { class: 'empty', text: 'No colours edited yet. Pick a colour in the list, or click something on the map.' }));
      } else if (!shown && this.query) {
        frag.append(el('p', { class: 'empty', text: `Nothing matches “${this.query}”. Try an entry name such as motorway or route_fast.` }));
      }
      // Re-rendering replaces the controls; put keyboard focus back where it was.
      const focusId = document.activeElement && this.list.contains(document.activeElement) ? document.activeElement.id : null;
      const scroll = this.list.scrollTop;
      this.list.replaceChildren(frag);
      this.list.scrollTop = scroll;
      if (focusId) {
        const again = document.getElementById(focusId);
        if (again) again.focus({ preventScroll: true });
      }
      this.count.textContent = `${shown} of ${groups.reduce((n, g) => n + g.rows.length, 0)}`;
    }

    renderGroup(g, rows) {
      const collapsed = this.collapsed.has(g.id) && !this.query;
      const head = el('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!collapsed) }, [
        el('span', { class: 'group-title', text: g.title }),
        el('span', { class: 'group-count', text: String(rows.length) }),
      ]);
      head.addEventListener('click', () => {
        if (this.collapsed.has(g.id)) this.collapsed.delete(g.id);
        else this.collapsed.add(g.id);
        MIB.util.store.set('mib2-style-lab:collapsed', [...this.collapsed]);
        this.render();
      });
      const body = el('div', { class: 'group-rows', hidden: collapsed });
      if (!collapsed) for (const r of rows) body.append(this.renderRow(r));
      return el('section', { class: 'group', dataset: { group: g.id } }, [head, body]);
    }

    renderRow(row) {
      const api = this.api;
      const e = api.entry(row.primary);
      const edited = row.members.some((n) => api.isEdited(n));
      const isOpen = this.open && this.open.rowId === row.id;
      // Areas only use their fill (and the sky its outline), so those rows show one swatch.
      const only = row.slots.only;
      const pen = swatch(e.pen, `${row.slots.pen} colour`);
      const brush = swatch(e.brush, `${row.slots.brush} colour`);
      pen.classList.add('pen');
      const many = row.members.length > 1;
      const node = el('div', { class: `row${isOpen ? ' is-open' : ''}${edited ? ' is-edited' : ''}`, dataset: { row: row.id } }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: `swatches${only ? ' single' : ''}` }, only === 'pen' ? [pen] : only === 'brush' ? [brush] : [brush, pen]),
          el('button', { type: 'button', class: 'row-text', 'aria-expanded': String(!!isOpen) }, [
            el('span', { class: 'row-label', text: row.label }),
            el('span', { class: 'row-sub', text: many ? `${row.sub || row.primary}` : row.primary }),
          ]),
          el('span', { class: 'edited-dot', title: 'Edited' }),
        ]),
      ]);
      const toggle = () => {
        this.open = isOpen ? null : { rowId: row.id, member: null };
        this.render();
        if (!isOpen) this.scrollTo(row.id);
      };
      node.querySelector('.row-text').addEventListener('click', toggle);
      if (only === 'pen') pen.classList.remove('pen');
      pen.addEventListener('click', () => {
        this.open = { rowId: row.id, member: null, focus: 'pen' };
        this.render();
        this.scrollTo(row.id);
      });
      brush.addEventListener('click', () => {
        this.open = { rowId: row.id, member: null, focus: 'brush' };
        this.render();
        this.scrollTo(row.id);
      });
      if (isOpen) node.append(this.renderInspector(row));
      return node;
    }

    renderInspector(row) {
      const api = this.api;
      const member = this.open.member;
      const target = member || row.primary;
      const box = el('div', { class: 'inspector' });

      if (member) {
        const back = el('button', { type: 'button', class: 'link-button', text: `← All ${row.members.length} in “${row.label}”` });
        back.addEventListener('click', () => {
          this.open = { rowId: row.id, member: null };
          this.render();
        });
        box.append(back, el('p', { class: 'inspector-title' }, [row.memberLabel ? row.memberLabel(member) : MIB.catalog.humanise(member), ' ', el('code', { text: member })]));
      }

      const only = row.slots.only;
      if (only) {
        const unused = only === 'pen' ? 'brush' : 'pen';
        box.append(this.renderSlot(row, target, only, !!member));
        const extra = el('details', { class: 'members' }, [el('summary', { text: `${row.slots[unused]} colour (not drawn)` }), el('p', { class: 'note subtle', text: row.slots.note }), this.renderSlot(row, target, unused, !!member)]);
        if (!sameSlot(api.entry(target)[unused], api.base(target)[unused])) extra.open = true;
        box.append(extra);
      } else {
        box.append(this.renderSlot(row, target, 'brush', !!member));
        box.append(this.renderSlot(row, target, 'pen', !!member));
      }

      const many = !member && row.members.length > 1;
      if (many) {
        box.append(
          el('p', {
            class: 'note',
            text: row.variants
              ? 'Changing a colour also changes the variants that use the same colour. Variants with a colour of their own keep it.'
              : `Changing a colour changes it in all ${row.members.length} entries that use it. Entries with a colour of their own keep it.`,
          })
        );
        const details = el('details', { class: 'members' }, [el('summary', { text: row.variants ? 'Variants' : `Edit one entry (${row.members.length})` })]);
        const list = el('div', { class: 'member-list' });
        const items = row.variants ? [{ name: row.primary, label: 'Standard' }, ...row.variants] : row.members.map((n) => ({ name: n, label: row.memberLabel ? row.memberLabel(n) : n }));
        for (const it of items) {
          const e = api.entry(it.name);
          const b = el('button', { type: 'button', class: `member${api.isEdited(it.name) ? ' is-edited' : ''}` }, [
            el('span', { class: 'mini', style: `--a:${e.brush.color.slice(0, 7)};--b:${e.pen.color.slice(0, 7)}` }),
            el('span', { class: 'member-label', text: it.label }),
            el('code', { text: it.name }),
          ]);
          b.addEventListener('click', () => {
            this.open = { rowId: row.id, member: it.name };
            this.render();
          });
          list.append(b);
        }
        details.append(list);
        if (row.members.length <= 12) details.open = !!row.variants;
        box.append(details);
      }

      const actions = el('div', { class: 'inspector-actions' });
      const names = member ? [member] : row.members;
      if (names.some((n) => api.hasOwnEdit(n))) {
        const reset = el('button', { type: 'button', class: 'button ghost', text: member ? 'Reset this entry' : 'Reset to original' });
        reset.addEventListener('click', () => {
          api.reset(names);
          this.render();
        });
        actions.append(reset);
      }
      if (row.primary === 'map_background') {
        box.append(el('p', { class: 'note subtle', text: 'Land outside built-up areas takes the terrain colours (under Terrain colours, below) wherever they apply, as they do at every zoom in the Audi files. This colour shows only where they don\'t.' }));
      }
      if (names.some((n) => api.isEdited(n)) && !names.some((n) => api.hasOwnEdit(n))) {
        box.append(el('p', { class: 'note subtle', text: 'This colour follows your change on the Standard map. Change it here to give this map its own colour.' }));
      }
      if (!names.some((n) => api.inScene(n))) box.append(el('p', { class: 'note subtle', text: 'The sample city does not show this one, but your change is saved into the exported files.' }));
      else if (!api.drawnNow(names)) box.append(el('p', { class: 'note subtle', text: 'Not drawn at this zoom or with these layers. Try another zoom level, the 3D view, or switching on Route and Traffic.' }));
      box.append(actions);
      return box;
    }

    renderSlot(row, target, slot, single) {
      const api = this.api;
      const value = api.entry(target)[slot];
      const original = api.base(target)[slot];
      const { r, g, b, a } = hexToRgba(value.color);
      const id = `${row.id}-${slot}`.replace(/[^a-z0-9_-]/gi, '_');
      const colourInput = el('input', { type: 'color', id: `${id}-c`, value: rgbaToHex({ r, g, b, a: 255 }).slice(0, 7).toLowerCase(), 'aria-label': `${row.slots[slot]} colour` });
      const alpha = el('input', { type: 'range', id: `${id}-a`, min: '0', max: '255', step: '1', value: String(a), 'aria-label': `${row.slots[slot]} opacity` });
      const alphaOut = el('output', { for: `${id}-a`, text: `${Math.round((a / 255) * 100)}%` });
      const hex = el('input', { type: 'text', id: `${id}-h`, class: 'hex-input', value: value.color, spellcheck: 'false', autocomplete: 'off', 'aria-label': `${row.slots[slot]} hex value, #RRGGBBAA` });
      const styles = ['solid', 'transparent'];
      if (value.style === 'pattern' || original.style === 'pattern') styles.push('pattern');
      const select = el(
        'select',
        { id: `${id}-s`, 'aria-label': `${row.slots[slot]} visibility` },
        styles.map((s) => el('option', { value: s, selected: s === value.style, text: STYLE_LABELS[s] }))
      );
      const changed = !sameSlot(value, original);

      const apply = (next) => {
        api.beginEdit();
        api.setSlot(row, single ? target : null, slot, next);
        this.refreshSwatches();
      };
      const fromInputs = () => {
        const rgb = hexToRgba(colourInput.value + 'ff');
        return { color: rgbaToHex({ r: rgb.r, g: rgb.g, b: rgb.b, a: +alpha.value }), style: select.value };
      };
      const sync = (v) => {
        hex.value = v.color;
        alphaOut.textContent = `${Math.round((hexToRgba(v.color).a / 255) * 100)}%`;
      };
      colourInput.addEventListener('input', () => {
        const v = fromInputs();
        sync(v);
        apply(v);
      });
      alpha.addEventListener('input', () => {
        const v = fromInputs();
        sync(v);
        apply(v);
      });
      select.addEventListener('change', () => {
        apply(fromInputs());
        api.commitEdit();
      });
      for (const n of [colourInput, alpha]) n.addEventListener('change', () => api.commitEdit());
      hex.addEventListener('change', () => {
        const h = normaliseHex(hex.value);
        if (!h) {
          hex.setCustomValidity('Use #RRGGBB or #RRGGBBAA');
          hex.reportValidity();
          return;
        }
        hex.setCustomValidity('');
        const c = hexToRgba(h);
        colourInput.value = rgbaToHex({ r: c.r, g: c.g, b: c.b, a: 255 }).slice(0, 7).toLowerCase();
        alpha.value = String(c.a);
        const v = { color: h, style: select.value };
        sync(v);
        apply(v);
        api.commitEdit();
      });

      const wrap = el('div', { class: `slot${changed ? ' is-changed' : ''}`, dataset: { slot } }, [
        el('div', { class: 'slot-head' }, [
          el('label', { for: `${id}-c`, class: 'slot-name', text: row.slots[slot] }),
          changed ? el('span', { class: 'was', title: 'Original colour' }, ['was ', el('span', { class: 'mini-chip', style: `--c:${original.color.slice(0, 7)}` }), el('code', { text: original.color })]) : null,
        ]),
        el('div', { class: 'slot-controls' }, [
          el('div', { class: 'colour-well' }, [colourInput]),
          hex,
          el('div', { class: 'alpha' }, [alpha, alphaOut]),
          select,
        ]),
      ]);
      if (this.open && this.open.focus === slot) {
        requestAnimationFrame(() => colourInput.focus({ preventScroll: true }));
        this.open.focus = null;
      }
      return wrap;
    }

    renderTerrain() {
      const api = this.api;
      const dtm = api.dtm();
      if (!dtm.length) return null;
      const groupId = 'terrain';
      const collapsed = this.collapsed.has(groupId) && !this.query;
      if (this.query && !'terrain dtm height'.includes(this.query)) return null;
      const head = el('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!collapsed) }, [
        el('span', { class: 'group-title', text: 'Terrain colours' }),
        el('span', { class: 'group-count', text: String(dtm.length) }),
      ]);
      head.addEventListener('click', () => {
        if (this.collapsed.has(groupId)) this.collapsed.delete(groupId);
        else this.collapsed.add(groupId);
        MIB.util.store.set('mib2-style-lab:collapsed', [...this.collapsed]);
        this.render();
      });
      const body = el('div', { class: 'group-rows terrain', hidden: collapsed });
      if (!collapsed) {
        body.append(el('p', { class: 'note subtle', text: 'Land colour by height above sea level. Each band applies from the zoom level shown, as you zoom out.' }));
        const buckets = new Map();
        dtm.forEach((d, i) => {
          if (!buckets.has(d.resolution)) buckets.set(d.resolution, []);
          buckets.get(d.resolution).push({ ...d, index: i });
        });
        for (const [res, stops] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
          const line = el('div', { class: 'terrain-band' }, [el('span', { class: 'terrain-zoom', text: api.zoomLabelFor(res / 256) })]);
          const strip = el('div', { class: 'terrain-stops' });
          for (const s of stops) {
            const input = el('input', {
              type: 'color',
              id: `dtm-${s.index}`,
              value: s.color.slice(0, 7).toLowerCase(),
              title: `${s.height} m · ${s.color}`,
              'aria-label': `Terrain colour at ${s.height} metres, ${api.zoomLabelFor(res / 256)}`,
            });
            input.addEventListener('input', () => {
              api.beginEdit();
              api.setDtm(s.index, input.value.toUpperCase() + s.color.slice(7));
            });
            input.addEventListener('change', () => {
              api.commitEdit();
              this.render();
            });
            strip.append(el('label', { class: `terrain-stop${api.isDtmEdited(s.index) ? ' is-edited' : ''}` }, [input, el('span', { text: `${s.height}` })]));
          }
          line.append(strip);
          body.append(line);
        }
      }
      return el('section', { class: 'group', dataset: { group: groupId } }, [head, body]);
    }

    renderTuning() {
      const api = this.api;
      const groupId = 'tuning';
      const collapsed = this.collapsed.has(groupId) && !this.query;
      const head = el('button', { type: 'button', class: 'group-head', 'aria-expanded': String(!collapsed) }, [
        el('span', { class: 'group-title', text: 'Display tuning' }),
        el('span', { class: 'group-count', text: '4' }),
      ]);
      head.addEventListener('click', () => {
        if (this.collapsed.has(groupId)) this.collapsed.delete(groupId);
        else this.collapsed.add(groupId);
        MIB.util.store.set('mib2-style-lab:collapsed', [...this.collapsed]);
        this.render();
      });
      const body = el('div', { class: 'group-rows tuning', hidden: collapsed });
      if (!collapsed) {
        body.append(el('p', { class: 'note subtle', text: 'The head unit multiplies every map colour by these factors. 100% leaves colours as they are.' }));
        for (const [name, label] of [
          ['color_red_factor', 'Red'],
          ['color_green_factor', 'Green'],
          ['color_blue_factor', 'Blue'],
          ['color_saturation_factor', 'Saturation'],
        ]) {
          const v = +(api.tuning(name) || 256);
          const input = el('input', { type: 'range', id: `tune-${name}`, min: '0', max: '512', step: '4', value: String(v) });
          const out = el('output', { for: `tune-${name}`, text: `${Math.round((v / 256) * 100)}%` });
          input.addEventListener('input', () => {
            out.textContent = `${Math.round((+input.value / 256) * 100)}%`;
            api.beginEdit();
            api.setTuning(name, input.value);
          });
          input.addEventListener('change', () => api.commitEdit());
          body.append(el('div', { class: `tune${api.isTuningEdited(name) ? ' is-edited' : ''}` }, [el('label', { for: `tune-${name}`, text: label }), input, out]));
        }
      }
      return el('section', { class: 'group', dataset: { group: groupId } }, [head, body]);
    }

    refreshSwatches() {
      const api = this.api;
      const rows = new Map(api.groups().flatMap((g) => g.rows.map((r) => [r.id, r])));
      for (const node of this.list.querySelectorAll('.row')) {
        const row = rows.get(node.dataset.row);
        if (!row) continue;
        const e = api.entry(row.primary);
        const nodes = node.querySelectorAll('.swatches .swatch');
        if (row.slots.only === 'pen') paintSwatch(nodes[0], e.pen);
        else {
          paintSwatch(nodes[0], e.brush);
          if (nodes[1]) paintSwatch(nodes[1], e.pen);
        }
        const edited = row.members.some((n) => api.isEdited(n));
        node.classList.toggle('is-edited', edited);
      }
    }

    // Opens the row that contains `name` (from a click on the map).
    reveal(name) {
      const groups = this.api.groups();
      for (const g of groups) {
        for (const r of g.rows) {
          if (!r.members.includes(name)) continue;
          if (!this.rowVisible(r)) {
            this.filter = 'all';
            this.query = '';
            this.root.querySelector('#colour-search').value = '';
            for (const o of this.root.querySelectorAll('[data-filter]')) o.setAttribute('aria-pressed', String(o.dataset.filter === 'all'));
          }
          this.collapsed.delete(g.id);
          this.open = { rowId: r.id, member: r.variants && name !== r.primary ? name : null };
          this.render();
          this.scrollTo(r.id, true);
          return true;
        }
      }
      return false;
    }

    scrollTo(rowId, flash) {
      requestAnimationFrame(() => {
        const node = this.list.querySelector(`[data-row="${CSS.escape(rowId)}"]`);
        if (!node) return;
        node.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        if (flash) {
          node.classList.remove('flash');
          void node.offsetWidth;
          node.classList.add('flash');
        }
      });
    }
  }

  MIB.Editor = Editor;
  MIB.editorHelpers = { sameSlot };
})((window.MIB = window.MIB || {}));
