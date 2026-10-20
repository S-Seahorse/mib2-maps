// Groups the ~1,280 colour entries of a MapConfig into rows people can edit.
//
// A row edits one or more entries. Road classes carry their variants (bridge,
// tunnel, toll...), and the long generated families (route colours for every
// route type and leg, traffic events) are folded into rows of entries that
// share a colour. Changing a row recolours every member that still had the
// row's previous colour, so a deliberately different variant keeps its colour.
(function (MIB) {
  'use strict';

  const ROAD_CLASSES = ['motorway', 'dualcarriageway', 'expressway', 'countryroad', 'urbanroad'];
  const ROAD_VARIANTS = ['bridge', 'tunnel', 'toll', 'hov_lane', 'seasonally_restricted', 'special_charge'];

  const LABELS = {
    map_background: 'Land',
    built_up: 'Built-up area',
    sky_background: 'Sky',
    fog: 'Horizon haze',
    golfcourse: 'Golf course',
    harbour_port: 'Harbour',
    industrial_harbour: 'Industrial harbour',
    park_in_water: 'Park in water',
    university_college: 'University',
    shoppingcenter: 'Shopping centre',
    traffic_area_parking: 'Car park',
    railway_station: 'Railway station',
    pedestrian_area: 'Pedestrian area',
    military_base: 'Military base',
    environmental_zone: 'Low-emission zone',
    native_american_reservation: 'Reservation',
    ski_resort: 'Ski resort',
    city_models: '3D city models',
    bridge_shadow: 'Bridge shadow',
    dualcarriageway: 'Dual carriageway',
    countryroad: 'Country road',
    urbanroad: 'Urban road',
    pedestrianzone: 'Pedestrian street',
    restricted_road: 'Restricted road',
    enclosed_traffic_area_road: 'Private road',
    one_way_street: 'One-way street',
    one_way_arrows: 'One-way arrows',
    hiking_trail_main: 'Hiking trail',
    hiking_trail_bike: 'Bike trail',
    hiking_trail_fixed_rope: 'Fixed-rope trail',
    suburban_train: 'Suburban train',
    cartrain: 'Car train',
    capital_city_label: 'Capital city names',
    city_label: 'City and suburb names',
    road_label: 'Street names',
    poi_label: 'Place names',
    polygon_label: 'Area names',
    river_label: 'River names',
    waterway_label: 'Canal names',
    sea_label: 'Sea names',
    island_label: 'Island names',
    province_label: 'State names',
    province_capital_label: 'State capital names',
    prefectural_city_label: 'Prefecture city names',
    horizon_marker_label: 'Horizon marker names',
    weather_label: 'Weather labels',
    poi_fuelprice_label: 'Fuel prices',
    point_name_highlight: 'Highlighted place name',
    satcopyright_text_color: 'Satellite imagery credit',
    satcopyright_background_color: 'Satellite credit background',
    manoeuvre_arrowfirst: 'Next turn arrow',
    manoeuvre_arrownormal: 'Turn arrow',
    manoeuvre_arrow_shadow: 'Turn arrow shadow',
    manoeuvre_marker: 'Turn marker',
    lane_guidance_marker: 'Lane guidance marker',
    direction_arrow: 'Direction arrow',
    motorway_exit_marker: 'Motorway exit marker',
    bread_crumb_trail: 'Breadcrumb trail',
    edge_highlighting: 'Road highlight',
    cartographic_country_boundary: 'Country outline',
    international_boundary: 'International border',
    national_boundary: 'State border',
    major_contour_line: 'Major contour line',
    minor_contour_line: 'Minor contour line',
    rdv_outer_outline: 'Range outline',
    rdv_safe_zone: 'Range: safe zone',
    rdv_safe_zone_fadeout: 'Range: safe zone fade',
    rdv_safe_zone_outline: 'Range: safe zone outline',
    rdv_unreachable_area: 'Range: unreachable area',
    rdv_unreachable_area_fadeout: 'Range: unreachable fade',
    speed_and_flow_free_traffic: 'Free-flowing traffic',
    speed_and_flow_heavy_traffic: 'Heavy traffic',
    speed_and_flow_queuing_traffic: 'Queuing traffic',
    speed_and_flow_slow_traffic: 'Slow traffic',
    speed_and_flow_stationary_traffic: 'Stationary traffic',
    speed_and_flow_no_traffic: 'Road closed',
    speed_and_flow_unknown: 'Unknown flow',
  };

  const VARIANT_LABELS = {
    bridge: 'Bridge',
    tunnel: 'Tunnel',
    toll: 'Toll',
    hov_lane: 'Transit lane',
    seasonally_restricted: 'Seasonal closure',
    special_charge: 'Special charge',
  };

  function humanise(name) {
    if (LABELS[name]) return LABELS[name];
    const s = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // What the two colour slots mean for each kind of entry.
  const SLOTS = {
    area: { pen: 'Edge', brush: 'Fill', only: 'brush', note: 'Area edges are not drawn by the head unit.' },
    sky: { pen: 'Horizon', brush: 'Sky' },
    haze: { pen: 'Haze if fill hidden', brush: 'Haze' },
    line: { pen: 'Casing', brush: 'Fill' },
    label: { pen: 'Halo', brush: 'Text' },
    route: { pen: 'Line', brush: 'Centre' },
    traffic: { pen: 'Band', brush: 'Fill' },
    plain: { pen: 'Outline', brush: 'Fill' },
  };

  const GROUPS = [
    { id: 'land', title: 'Land and sky', slots: 'area', names: ['map_background', 'built_up', 'island', 'beach', 'woodland', 'park', 'golfcourse', 'cemetery', 'moor', 'glacier', 'sky_background', 'fog'] },
    { id: 'water', title: 'Water', slots: 'area', names: ['ocean', 'river', 'lake', 'canal', 'waterway', 'harbour_port', 'industrial_harbour', 'park_in_water'] },
    { id: 'places', title: 'Places', slots: 'area', names: ['airport', 'aircraft', 'industry', 'company', 'hospital', 'school', 'university_college', 'shoppingcenter', 'stadium', 'traffic_area_parking', 'railway_station', 'pedestrian_area', 'military_base', 'environmental_zone', 'native_american_reservation', 'ski_resort'] },
    { id: 'buildings', title: 'Buildings and structures', slots: 'area', names: ['building', 'city_models', 'bridge', 'bridge_shadow', 'elevated', 'tunnel'] },
    { id: 'roads', title: 'Roads', slots: 'line', names: [...ROAD_CLASSES, 'pedestrianzone', 'footway', 'restricted_road', 'enclosed_traffic_area_road', 'one_way_street', 'one_way_arrows', 'hiking_trail_main', 'hiking_trail_bike', 'hiking_trail_fixed_rope'] },
    { id: 'rail', title: 'Rail and ferry', slots: 'line', names: ['railway', 'suburban_train', 'subway', 'tramway', 'cartrain', 'ferry'] },
    { id: 'labels', title: 'Labels', slots: 'label', match: /_label$/, names: ['point_name_highlight', 'satcopyright_text_color', 'satcopyright_background_color'] },
    { id: 'route', title: 'Route', slots: 'route', names: ['route_blocking'], bulk: 'route' },
    { id: 'traffic', title: 'Traffic', slots: 'traffic', match: /^speed_and_flow_/, bulk: 'traffic' },
    { id: 'guidance', title: 'Guidance', slots: 'plain', names: ['manoeuvre_arrowfirst', 'manoeuvre_arrownormal', 'manoeuvre_arrow_shadow', 'manoeuvre_marker', 'lane_guidance_marker', 'direction_arrow', 'motorway_exit_marker', 'bread_crumb_trail', 'edge_highlighting'], match: /^rdv_/, bulk: 'guidance' },
    { id: 'boundaries', title: 'Borders and contours', slots: 'line', names: ['cartographic_country_boundary', 'international_boundary', 'national_boundary', 'major_contour_line', 'minor_contour_line'], bulk: 'contours' },
    { id: 'other', title: 'Other', slots: 'plain' },
  ];

  const ROUTE_TYPES = ['fast', 'short', 'economic', 'custom1', 'custom2'];
  const ROUTE_TYPE_LABELS = { fast: 'Fast', short: 'Short', economic: 'Economical', custom1: 'Custom 1', custom2: 'Custom 2' };
  const ROUTE_ROLES = [
    ['active_subtour_1', 'Active route'],
    ['active_subtour_n', 'Later legs, after a stopover'],
    ['normal', 'Route in overview'],
    ['selected', 'Selected route'],
    ['offroad_segment', 'Off-road section'],
    ['restricted_segment', 'Restricted section'],
    ['waypoint_route', 'Route to stopover'],
    ['waypoint_route_automatic_marker', 'Automatic stopover marker'],
    ['waypoint_route_manual_marker', 'Manual stopover marker'],
  ];

  function parseRouteName(name) {
    const m = /^route_(fast|short|economic|custom1|custom2)(?:_alternative(\d))?_(.+)$/.exec(name);
    if (!m) return null;
    let role = m[3];
    let leg = 1;
    const sub = /^active_subtour_(\d+)$/.exec(role);
    if (sub) {
      leg = +sub[1];
      role = leg === 1 ? 'active_subtour_1' : 'active_subtour_n';
    }
    return { type: m[1], alternative: m[2] ? +m[2] : 0, role, leg };
  }

  const TRAFFIC_SIDES = [
    ['on_route', 'on your route'],
    ['affecting_route', 'affecting your route'],
    ['off_route', 'off your route'],
  ];

  function trafficEventLabel(name) {
    const base = name
      .replace(/^(tmc|tti)_/, '')
      .replace(/_(on|off|affecting)_route$/, '')
      .replace(/^message_arrow_/, 'message arrow ');
    const coded = /^(\d+)(?:_(.+))?$/.exec(base);
    if (coded) return `Traffic message ${coded[1]}${coded[2] ? ` (${coded[2].replace(/_/g, ' ')})` : ''}`;
    return humanise(base);
  }

  const colourKey = (e) => `${e.pen.color}|${e.pen.style}|${e.brush.color}|${e.brush.style}`;

  // Splits members into clusters with the same colours, keeping first-seen order.
  function clusterByColour(names, entries) {
    const clusters = new Map();
    for (const n of names) {
      const k = colourKey(entries.get(n));
      if (!clusters.has(k)) clusters.set(k, []);
      clusters.get(k).push(n);
    }
    return [...clusters.values()];
  }

  function build(model) {
    const entries = model.entries;
    const used = new Set();
    const groups = [];
    const take = (n) => {
      used.add(n);
      return n;
    };

    for (const g of GROUPS) {
      const rows = [];
      const slots = SLOTS[g.slots];

      for (const name of g.names || []) {
        if (!entries.has(name) || used.has(name)) continue;
        take(name);
        if (name === 'sky_background' || name === 'fog') {
          rows.push({ id: name, label: humanise(name), sub: name, primary: name, members: [name], slots: name === 'fog' ? SLOTS.haze : SLOTS.sky });
        } else if (name === 'satcopyright_background_color') {
          rows.push({ id: name, label: humanise(name), sub: name, primary: name, members: [name], slots: SLOTS.plain });
        } else if (ROAD_CLASSES.includes(name)) {
          const variants = ROAD_VARIANTS.map((v) => `${name}_${v}`).filter((v) => entries.has(v) && !used.has(v));
          variants.forEach(take);
          rows.push({
            id: name,
            label: humanise(name),
            sub: name,
            primary: name,
            members: [name, ...variants],
            variants: variants.map((v) => ({ name: v, label: VARIANT_LABELS[v.slice(name.length + 1)] || humanise(v) })),
            slots,
          });
        } else {
          rows.push({ id: name, label: humanise(name), sub: name, primary: name, members: [name], slots });
        }
      }

      if (g.match) {
        for (const name of entries.keys()) {
          if (used.has(name) || !g.match.test(name)) continue;
          take(name);
          rows.push({ id: name, label: humanise(name), sub: name, primary: name, members: [name], slots });
        }
      }

      if (g.bulk === 'route') rows.push(...routeRows(entries, take, used, slots));
      if (g.bulk === 'traffic') rows.push(...trafficRows(entries, take, used, slots));
      if (g.bulk === 'guidance') {
        rows.push(...familyRows(entries, take, used, slots, /^maneuver_marker_\d+$/, 'Turn markers'));
        rows.push(...familyRows(entries, take, used, slots, /^edge_highlighting_preset\d+$/, 'Road highlight presets'));
      }
      if (g.bulk === 'contours') rows.push(...familyRows(entries, take, used, slots, /^topographic_contour_\d+$/, 'Height contours'));

      if (g.id === 'other') {
        for (const name of entries.keys()) {
          if (used.has(name)) continue;
          take(name);
          rows.push({ id: name, label: humanise(name), sub: name, primary: name, members: [name], slots });
        }
      }

      if (rows.length) groups.push({ id: g.id, title: g.title, rows });
    }
    return groups;
  }

  const ROLE_LABELS = Object.fromEntries(ROUTE_ROLES);
  const ROUTE_PARTS = [
    { id: 'line', label: '', roles: ['active_subtour_1', 'normal', 'selected', 'offroad_segment', 'restricted_segment', 'waypoint_route'] },
    { id: 'legs', label: 'later legs', roles: ['active_subtour_n'] },
    { id: 'markers', label: 'stopover markers', roles: ['waypoint_route_automatic_marker', 'waypoint_route_manual_marker'] },
  ];

  // Each route type (Fast, Short...) has its own colours, shared by its
  // alternatives, except where an alternative was given colours of its own.
  // So: one set of rows per route type, plus one per alternative that differs.
  function routeRows(entries, take, used, slots) {
    const parsed = new Map();
    for (const name of entries.keys()) {
      if (used.has(name)) continue;
      const r = parseRouteName(name);
      if (r) parsed.set(name, r);
    }
    const rows = [];
    for (const type of ROUTE_TYPES) {
      const groups = new Map();
      for (let alt = 0; alt <= 5; alt++) {
        const key = `route_${type}${alt ? `_alternative${alt}` : ''}_active_subtour_1`;
        if (!entries.has(key)) continue;
        const k = colourKey(entries.get(key));
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(alt);
      }
      for (const alts of groups.values()) {
        const altText = alts[0] === 0 ? '' : ` · alternative ${alts.join(' and ')}`;
        for (const part of ROUTE_PARTS) {
          const members = [...parsed.entries()]
            .filter(([n, r]) => r.type === type && alts.includes(r.alternative) && part.roles.includes(r.role) && !used.has(n))
            .map(([n]) => n);
          if (!members.length) continue;
          members.forEach(take);
          rows.push({
            id: `route:${type}:${alts.join('-')}:${part.id}`,
            label: `${ROUTE_TYPE_LABELS[type]} route${altText}${part.label ? ` · ${part.label}` : ''}`,
            sub: `${members.length} ${members.length === 1 ? 'entry' : 'entries'}`,
            primary: members[0],
            members,
            slots,
            routeType: type,
            memberLabel: (n) => {
              const r = parseRouteName(n);
              const where = r.alternative ? `Alternative ${r.alternative}: ` : '';
              return `${where}${ROLE_LABELS[r.role]}${r.role === 'active_subtour_n' ? `, leg ${r.leg}` : ''}`;
            },
          });
        }
      }
    }
    return rows;
  }

  // A rough colour name, so rows of traffic events read "red" or "grey" rather than a hex code.
  function colourName(hex) {
    const { r, g, b } = MIB.util.hexToRgba(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 510;
    const s = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    if (s < 0.18) return l > 0.85 ? 'white' : l < 0.15 ? 'black' : 'grey';
    let h;
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h = (h * 60 + 360) % 360;
    if (h < 15 || h >= 340) return 'red';
    if (h < 40) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 200) return 'cyan';
    if (h < 255) return 'blue';
    if (h < 300) return 'purple';
    return 'pink';
  }

  function trafficRows(entries, take, used, slots) {
    const rows = [];
    for (const [side, sideLabel] of TRAFFIC_SIDES) {
      const names = [...entries.keys()].filter((n) => !used.has(n) && /^(tmc|tti)_/.test(n) && n.endsWith(`_${side}`));
      if (!names.length) continue;
      names.forEach(take);
      clusterByColour(names, entries).forEach((members, i) => {
        const single = members.length === 1;
        rows.push({
          id: `traffic:${side}:${i}`,
          label: single ? `${trafficEventLabel(members[0])} ${sideLabel}` : `Traffic events ${sideLabel} · ${colourName(entries.get(members[0]).pen.color)}`,
          sub: single ? members[0] : `${members.length} event types`,
          primary: members[0],
          members,
          slots,
          trafficSide: side,
          memberLabel: trafficEventLabel,
        });
      });
    }
    const rest = [...entries.keys()].filter((n) => !used.has(n) && /^(tmc|tti)_/.test(n));
    rest.forEach(take);
    clusterByColour(rest, entries).forEach((members, i) => {
      rows.push({
        id: `traffic:other:${i}`,
        label: members.length === 1 ? trafficEventLabel(members[0]) : 'Other traffic markers',
        sub: members.length === 1 ? members[0] : `${members.length} entries`,
        primary: members[0],
        members,
        slots,
        memberLabel: trafficEventLabel,
      });
    });
    return rows;
  }

  function familyRows(entries, take, used, slots, re, label) {
    const names = [...entries.keys()].filter((n) => !used.has(n) && re.test(n));
    if (!names.length) return [];
    names.forEach(take);
    return clusterByColour(names, entries).map((members, i, all) => ({
      id: `${label}:${i}`,
      label: all.length > 1 ? `${label} (${i + 1})` : label,
      sub: `${members.length} entries`,
      primary: members[0],
      members,
      slots,
      memberLabel: (n) => n,
    }));
  }

  MIB.catalog = { build, humanise, parseRouteName, ROUTE_TYPES, ROUTE_TYPE_LABELS, SLOTS };
})((window.MIB = window.MIB || {}));
