// The sample city the previewer draws: "Ellery", a made-up Australian harbour
// city laid out so that every common map feature appears on screen. A rotated
// CBD grid sits on a river that runs into a bay, with docks, an island,
// motorways (with a bridge, a tunnel and a toll section), suburbs, rail lines,
// parks and wooded hills to the east.
//
// Units are metres; x runs east and y runs north. Lines and rings are flat
// arrays [x0, y0, x1, y1, ...].
(function (MIB) {
  'use strict';
  const rand = MIB.util.rng(20210608);

  // ---- geometry helpers ---------------------------------------------------

  const PHI = (20 * Math.PI) / 180; // the CBD grid is turned 20° anticlockwise
  const COS = Math.cos(PHI);
  const SIN = Math.sin(PHI);
  const CBD = { x: 0, y: 400 };

  // CBD grid coordinates (u along the main streets, v along the cross streets) to world.
  const G = (u, v) => [u * COS - v * SIN + CBD.x, u * SIN + v * COS + CBD.y];
  const gridLine = (pairs) => pairs.flatMap(([u, v]) => G(u, v));

  // Catmull-Rom spline through control points, for rivers, coasts and curving roads.
  function smooth(points, steps = 8) {
    const out = [];
    const n = points.length / 2;
    const P = (i) => {
      const j = Math.max(0, Math.min(n - 1, i));
      return [points[j * 2], points[j * 2 + 1]];
    };
    for (let i = 0; i < n - 1; i++) {
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        for (let k = 0; k < 2; k++) {
          out.push(0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
        }
      }
    }
    out.push(points[points.length - 2], points[points.length - 1]);
    return out;
  }

  // Shifts each point sideways by a little noise so coasts don't look drawn with a ruler.
  function wobble(line, amp, seed) {
    const r = MIB.util.rng(seed);
    const out = line.slice();
    for (let i = 2; i < line.length - 2; i += 2) {
      const dx = line[i + 2] - line[i - 2];
      const dy = line[i + 3] - line[i - 1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (r() - 0.5) * 2 * amp;
      out[i] += (-dy / len) * off;
      out[i + 1] += (dx / len) * off;
    }
    return out;
  }

  // Parallel line at a signed distance (left of travel is positive).
  function offsetLine(line, d) {
    const out = [];
    const n = line.length / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = line[b * 2] - line[a * 2];
      const dy = line[b * 2 + 1] - line[a * 2 + 1];
      const len = Math.hypot(dx, dy) || 1;
      out.push(line[i * 2] - (dy / len) * d, line[i * 2 + 1] + (dx / len) * d);
    }
    return out;
  }

  // Polygon around a line, with a width that can change along it.
  function buffer(line, widthAt) {
    const n = line.length / 2;
    const left = [];
    const right = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = line[b * 2] - line[a * 2];
      const dy = line[b * 2 + 1] - line[a * 2 + 1];
      const len = Math.hypot(dx, dy) || 1;
      const w = (typeof widthAt === 'function' ? widthAt(i / (n - 1)) : widthAt) / 2;
      left.push(line[i * 2] - (dy / len) * w, line[i * 2 + 1] + (dx / len) * w);
      right.push(line[i * 2] + (dy / len) * w, line[i * 2 + 1] - (dx / len) * w);
    }
    const ring = left.slice();
    for (let i = n - 1; i >= 0; i--) ring.push(right[i * 2], right[i * 2 + 1]);
    return ring;
  }

  function ellipse(cx, cy, rx, ry, rot = 0, steps = 40, jitter = 0, seed = 1) {
    const r = MIB.util.rng(seed);
    const out = [];
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const k = 1 + (r() - 0.5) * jitter;
      const x = Math.cos(t) * rx * k;
      const y = Math.sin(t) * ry * k;
      out.push(cx + x * c - y * s, cy + x * s + y * c);
    }
    return out;
  }

  const rect = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];
  const gridRect = (u0, v0, u1, v1) => [...G(u0, v0), ...G(u1, v0), ...G(u1, v1), ...G(u0, v1)];

  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const xi = ring[i];
      const yi = ring[i + 1];
      const xj = ring[j];
      const yj = ring[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function bbox(arr) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < arr.length; i += 2) {
      if (arr[i] < x0) x0 = arr[i];
      if (arr[i] > x1) x1 = arr[i];
      if (arr[i + 1] < y0) y0 = arr[i + 1];
      if (arr[i + 1] > y1) y1 = arr[i + 1];
    }
    return [x0, y0, x1, y1];
  }

  function lineLength(line) {
    let d = 0;
    for (let i = 2; i < line.length; i += 2) d += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
    return d;
  }

  // Point and direction at a fraction of the way along a line.
  function along(line, f) {
    const total = lineLength(line) * f;
    let d = 0;
    for (let i = 2; i < line.length; i += 2) {
      const seg = Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
      if (d + seg >= total || i === line.length - 2) {
        const t = seg ? Math.min(1, (total - d) / seg) : 0;
        return {
          x: line[i - 2] + (line[i] - line[i - 2]) * t,
          y: line[i - 1] + (line[i + 1] - line[i - 1]) * t,
          angle: Math.atan2(line[i + 1] - line[i - 1], line[i] - line[i - 2]),
        };
      }
      d += seg;
    }
    return { x: line[0], y: line[1], angle: 0 };
  }

  // Part of a line between two fractions of its length.
  function slice(line, f0, f1) {
    const total = lineLength(line);
    const a = f0 * total;
    const b = f1 * total;
    const out = [];
    let d = 0;
    for (let i = 2; i < line.length; i += 2) {
      const x0 = line[i - 2];
      const y0 = line[i - 1];
      const x1 = line[i];
      const y1 = line[i + 1];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      const s0 = d;
      const s1 = d + seg;
      if (s1 >= a && s0 <= b && seg > 0) {
        const t0 = Math.max(0, (a - s0) / seg);
        const t1 = Math.min(1, (b - s0) / seg);
        if (!out.length) out.push(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0);
        out.push(x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
      }
      d = s1;
    }
    return out;
  }

  // ---- the city -----------------------------------------------------------

  const areas = []; // drawn in this order
  const lines = [];
  const buildings = [];
  const labels = [];
  const area = (cls, ring, extra) => areas.push(Object.assign({ cls, ring, box: bbox(ring) }, extra));
  const road = (cls, pts, extra) => {
    const f = Object.assign({ cls, pts, box: bbox(pts) }, extra);
    lines.push(f);
    return f;
  };

  // Land and water.
  const coast = wobble(
    smooth([-21000, -1800, -12000, -2200, -7600, -2050, -4700, -2350, -3700, -2650, -2400, -3600, -600, -4600, 1800, -5400, 4600, -7400, 7000, -10000, 9000, -13000, 10500, -16500], 10),
    90,
    7
  );
  const ocean = coast.concat([-21500, -16500, -21500, -1800]);

  const builtUp = smooth([-16500, -800, -16000, 8500, -6000, 12600, 3000, 13000, 8600, 9500, 9200, 3000, 8200, -2600, 6500, -6400, 2000, -6200, -3000, -4200, -16500, -800], 4);

  const riverLine = smooth([12500, 1300, 8500, 2700, 6000, 2200, 3500, 900, 1800, 200, 1100, -100, 0, -420, -900, -850, -2200, -1500, -3000, -2050, -3750, -2700], 10);
  const river = buffer(riverLine, (t) => 90 + t * t * 260);

  const hills = [
    [15500, 5000, 3600, 380],
    [12200, 11800, 2600, 260],
    [17500, -1500, 2800, 210],
  ];
  const height = (x, y) => 30 + hills.reduce((h, [hx, hy, r, a]) => h + a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r)), 0);

  area('built_up', builtUp);
  area('woodland', ellipse(15400, 5200, 3000, 2300, 0.3, 48, 0.35, 3));
  area('woodland', ellipse(12300, 11700, 2000, 1500, -0.4, 40, 0.4, 4));
  area('woodland', ellipse(17800, -1400, 2100, 1800, 0.2, 40, 0.35, 5));
  area('moor', ellipse(15800, 5600, 900, 600, 0.6, 30, 0.3, 6));

  // Beach strips along the south-east shore; the sea is drawn over their outer half.
  area('beach', buffer(slice(coast, 0.505, 0.68), 160));

  // Parks and places.
  const kingsDomain = [480, -700, 1150, -480, 2600, -380, 2700, -1900, 1700, -2200, 940, -1950];
  area('park', kingsDomain, { name: 'Kings Domain' });
  area('park', gridRect(-400, 540, 420, 860), { name: 'Exhibition Gardens' });
  area('park', gridRect(-800, 200, -600, 400), { name: 'Flagstaff Gardens' });
  area('park', [-3300, 1900, -1500, 1700, -1300, 3600, -2700, 4000, -3500, 3100], { name: 'Royal Park' });
  area('park', buffer(slice(riverLine, 0.47, 0.6), 520));
  area('golfcourse', ellipse(4800, 4800, 900, 600, 0.3, 36, 0.25, 8));
  area('cemetery', rect(-700, 2700, 300, 3250));
  area('university_college', rect(-200, 1950, 900, 2500), { name: 'University' });
  area('hospital', rect(1400, 1750, 2100, 2200));
  area('school', rect(-2600, 4100, -2300, 4350));
  area('school', rect(3100, -3300, 3400, -3050));
  area('shoppingcenter', rect(-4400, 5100, -3900, 5450));
  area('shoppingcenter', rect(4100, -2600, 4600, -2250));
  area('stadium', ellipse(2650, 1050, 150, 115, 0.35, 32), { name: 'Ellery Park' });
  area('stadium', rect(3050, 1180, 3300, 1420));
  area('traffic_area_parking', rect(2250, 1250, 2480, 1420));
  area('traffic_area_parking', gridRect(-800, -400, -600, -300));
  area('company', rect(5600, 1250, 6400, 1750));
  area('industry', [-8600, -1500, -4300, -1250, -4200, -650, -8800, -800]);
  area('industry', rect(-9600, -1700, -8600, -1100));
  area('railway_station', gridRect(-60, -620, 560, -480), { name: 'Central' });
  area('railway_station', gridRect(-1060, -320, -930, 220), { name: 'Spencer Street' });
  area('pedestrian_area', gridRect(-180, -280, 0, -220));
  area('airport', [-13600, 7600, -9800, 7900, -9600, 10900, -13400, 11000]);
  const runway = (cx, cy, len, w, rot) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts = [
      [-len / 2, -w / 2],
      [len / 2, -w / 2],
      [len / 2, w / 2],
      [-len / 2, w / 2],
    ];
    return pts.flatMap(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  };
  area('aircraft', runway(-11700, 9400, 3200, 60, 0.12));
  area('aircraft', runway(-11300, 8700, 2400, 60, 1.35));
  area('aircraft', rect(-10900, 9900, -10100, 10500));

  // Water goes over the land use, then islands and harbour basins.
  area('ocean', ocean, { name: 'Hollis Bay' });
  area('river', river, { name: 'Marra River' });
  area('lake', ellipse(1750, -1250, 280, 150, 0.2, 32, 0.15, 9), { name: 'Ornamental Lake' });
  area('lake', ellipse(-2400, 2900, 220, 160, -0.3, 28, 0.2, 10));
  area('canal', buffer([-4350, -2200, -4300, -1500, -4250, -500], 70), { name: 'Coode Canal' });
  area('harbour_port', rect(-6500, -2250, -6200, -1550));
  area('harbour_port', rect(-5800, -2250, -5500, -1450));
  area('harbour_port', rect(-5150, -2300, -4850, -1650));
  area('industrial_harbour', rect(-7900, -2150, -7050, -1750));
  const island = ellipse(-9000, -7500, 1250, 650, 0.25, 48, 0.12, 11);
  area('island', island, { name: 'Gull Island' });
  area('beach', ellipse(-9050, -7560, 1180, 590, 0.25, 48, 0.12, 11));
  area('island', ellipse(-8950, -7470, 1080, 520, 0.25, 48, 0.12, 11));
  area('woodland', ellipse(-9200, -7400, 500, 260, 0.25, 30, 0.3, 12));

  const water = areas.filter((a) => ['ocean', 'river', 'lake', 'canal', 'harbour_port', 'industrial_harbour'].includes(a.cls));
  const islands = areas.filter((a) => a.cls === 'island');
  const isWater = (x, y) => {
    for (const w of water) {
      const [x0, y0, x1, y1] = w.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (inRing(x, y, w.ring)) return !islands.some((i) => inRing(x, y, i.ring));
    }
    return false;
  };

  // Hand-placed roads. Sections over water become bridges.
  function placeRoad(cls, pts, extra) {
    const f = road(cls, pts, extra);
    markBridges(f);
    return f;
  }

  function markBridges(f) {
    const spans = [];
    const pts = f.pts;
    const steps = Math.ceil(lineLength(pts) / 20);
    let start = null;
    for (let s = 0; s <= steps; s++) {
      const p = along(pts, s / steps);
      const wet = isWater(p.x, p.y);
      if (wet && start == null) start = s;
      if ((!wet || s === steps) && start != null) {
        spans.push([Math.max(0, (start - 2) / steps), Math.min(1, (s + 1) / steps)]);
        start = null;
      }
    }
    f.bridges = spans;
  }

  const roadNames = [];
  const named = (f, name, repeat) => {
    roadNames.push({ line: f.pts, name, cls: f.cls, repeat: repeat || 1 });
    return f;
  };

  // Motorways. `dual` draws both carriageways.
  const m1 = smooth([-21000, -200, -12000, -400, -7000, -650, -4200, -1250, -3300, -1800, -2600, -2500, -1500, -3100, 1000, -3500, 4000, -3700, 7000, -2500, 9500, 0, 11000, 4000, 12500, 9000, 14000, 16000], 10);
  named(placeRoad('motorway', m1, { dual: 16 }), 'Western Ring Fwy', 4);
  const m2 = smooth([-1500, -3150, 300, -2200, 1800, -900, 3500, 300, 6500, 1500, 10500, 2500, 14000, 3200, 21000, 3800], 10);
  const m2road = named(placeRoad('motorway', m2, { dual: 16 }), 'Eastern Fwy', 3);
  m2road.tunnels = [[0.12, 0.34]];
  m2road.tolls = [[0.45, 0.7]];
  const m3 = smooth([-7000, -650, -8200, 2500, -10000, 6000, -11500, 7800], 8);
  named(placeRoad('motorway', m3, { dual: 14 }), 'Airport Fwy');

  // Arterials.
  const kingsford = gridLine([
    [0, -9500],
    [0, -450],
  ]);
  named(placeRoad('dualcarriageway', kingsford, { dual: 9 }), 'Kingsford Rd', 3);
  const northern = smooth([...G(0, 450), -250, 2000, -400, 4500, -900, 8200, -1500, 13500], 6);
  named(placeRoad('dualcarriageway', northern, { dual: 9 }), 'Northern Rd', 3);
  const eastern = smooth([...G(900, 0), 2000, 1050, 4500, 1900, 8000, 2800, 10800, 3900], 8);
  named(placeRoad('dualcarriageway', eastern, { dual: 9 }), 'Victoria Pde', 2);
  const western = smooth([...G(-900, 0), -2500, -250, -4400, -750, -8000, -1000, -12000, -1150, -20500, -1250], 8);
  named(placeRoad('dualcarriageway', western, { dual: 9 }), 'Bay Rd', 3);
  const esplanade = slice(offsetLine(coast, 260), 0.52, 0.72);
  named(placeRoad('expressway', esplanade), 'The Esplanade', 2);

  // Secondary roads on a coarse grid across the suburbs.
  const expressways = [];
  for (const x of [-12800, -9600, -5600, -3200, 2800, 5600]) expressways.push([x, -3000, x, 12600]);
  for (const y of [3000, 6000, 9000]) expressways.push([-15500, y, 8600, y]);
  expressways.push([-2600, -3900, 5200, -3900]);
  const exNames = ['Hume St', 'Keilor Rd', 'Mount Alexander Rd', 'Sydney Rd', 'Hoddle St', 'Chandler Hwy', 'Bell St', 'Murray Rd', 'Dalton Rd', 'Glen Huntly Rd'];
  expressways.forEach(([x0, y0, x1, y1], i) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 100);
    let run = [];
    const flush = () => {
      if (run.length >= 4) named(placeRoad('expressway', run), exNames[i % exNames.length], 2);
      run = [];
    };
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      const onLand = inRing(x, y, builtUp) && !inRing(x, y, ocean);
      if (onLand) run.push(x, y);
      else flush();
    }
    flush();
  });

  // Country roads through the hills, one with a seasonal closure over the top.
  const hillRoad = (pts, name, seed) => named(placeRoad('countryroad', wobble(smooth(pts, 12), 40, seed)), name);
  const ridge = hillRoad([10800, 3900, 13000, 4300, 15000, 5300, 17200, 5000, 21000, 6800], 'Ridge Rd', 21);
  ridge.seasonal = [[0.42, 0.62]];
  hillRoad([11000, -800, 13500, 1200, 14800, 3200, 15300, 7600, 16400, 12500], 'Summit Rd', 22);
  hillRoad([12500, 9000, 14800, 10400, 17000, 10200, 21000, 13500], 'Kinglake Rd', 23);
  hillRoad([9500, 0, 13000, -1500, 16500, -900, 21000, -2600], 'Gully Rd', 24);

  // The CBD grid: five main streets, four one-way little streets, nine cross streets.
  const MAIN = [
    [-400, 'Wharf St'],
    [-200, 'Collier St'],
    [0, 'Regent St'],
    [200, 'Garvey St'],
    [400, 'Latham St'],
  ];
  const LITTLE = [-300, -100, 100, 300];
  const CROSS = ['Ainslie St', 'Banks St', 'Carrick St', 'Dalton St', 'Elgar St', 'Fenwick St', 'Gilmour St', 'Hayes St', 'Irving St'];
  for (const [v, name] of MAIN) named(road('urbanroad', gridLine([[-900, v], [900, v]])), name, 2);
  LITTLE.forEach((v, i) => {
    const littleName = `Little ${MAIN[i + (v > 0 ? 1 : 0)][1]}`;
    if (v === -100) {
      named(road('urbanroad', gridLine([[-900, v], [-200, v]]), { oneway: i % 2 ? 1 : -1 }), littleName);
      named(road('pedestrianzone', gridLine([[-200, v], [200, v]])), 'Bourke Mall');
      road('urbanroad', gridLine([[200, v], [900, v]]), { oneway: i % 2 ? 1 : -1 });
    } else {
      named(road('urbanroad', gridLine([[-900, v], [900, v]]), { oneway: i % 2 ? 1 : -1 }), littleName);
    }
  });
  CROSS.forEach((name, i) => {
    const u = -800 + i * 200;
    if (u === 0) return; // Kingsford Rd carries on through the grid as Elgar St
    named(road('urbanroad', gridLine([[u, -450], [u, 450]])), name);
  });
  named(road('dualcarriageway', gridLine([[0, -450], [0, 450]]), { dual: 9 }), 'Elgar St');
  road('urbanroad', gridLine([[-900, -450], [900, -450], [900, 450], [-900, 450], [-900, -450]]));

  // CBD buildings: lots in every block except parks, the station and the plaza.
  const skipBlock = (u, v) => (u === -800 && v >= 200) || (u === -800 && v === -400) || (u === -200 && v === -300);
  for (let u = -800; u < 800; u += 200) {
    for (let v = -400; v < 400; v += 100) {
      if (skipBlock(u, v)) continue;
      let x = u + 10;
      while (x < u + 190) {
        const w = 22 + rand() * 40;
        const x1 = Math.min(u + 190, x + w);
        const split = rand() < 0.5;
        if (split) {
          buildings.push(gridRect(x, v + 10, x1 - 4, v + 46));
          buildings.push(gridRect(x, v + 54, x1 - 4, v + 90));
        } else {
          buildings.push(gridRect(x, v + 10, x1 - 4, v + 90));
        }
        x = x1 + 4;
      }
    }
  }
  // A few larger buildings outside the grid.
  buildings.push(gridRect(-160, 640, 160, 760)); // exhibition hall
  for (let i = 0; i < 9; i++) buildings.push(rect(-120 + (i % 3) * 330, 2020 + Math.floor(i / 3) * 160, 120 + (i % 3) * 330, 2120 + Math.floor(i / 3) * 160));
  buildings.push(rect(1480, 1820, 2020, 2130));
  buildings.push(gridRect(20, -600, 540, -500)); // station concourse

  // Suburban streets: a regular grid inside the built-up area, skipping water,
  // parks, the CBD and other large sites.
  const keepOut = areas
    .filter((a) => ['park', 'golfcourse', 'cemetery', 'university_college', 'hospital', 'stadium', 'airport', 'industry', 'railway_station', 'island'].includes(a.cls))
    .map((a) => a.ring);
  keepOut.push(gridRect(-1000, -560, 1000, 520));
  const streetOk = (x, y) => inRing(x, y, builtUp) && !isWater(x, y) && !keepOut.some((r) => inRing(x, y, r));
  const DX = 400;
  const DY = 200;
  const sx0 = -15200;
  const sx1 = 9000;
  const sy0 = -6200;
  const sy1 = 12800;
  // A few missing blocks break up the grid, like cul-de-sacs and parks would.
  const gap = MIB.util.rng(77);
  for (let y = sy0; y <= sy1; y += DY) {
    let run = [];
    for (let x = sx0; x <= sx1; x += DX) {
      const ok = gap() > 0.07 && streetOk(x, y) && streetOk(x + DX, y) && streetOk(x + DX / 2, y);
      if (ok) {
        if (!run.length) run.push(x, y);
        run.push(x + DX, y);
      } else if (run.length) {
        road('urbanroad', run, { minor: true });
        run = [];
      }
    }
    if (run.length) road('urbanroad', run, { minor: true });
  }
  for (let x = sx0; x <= sx1; x += DX) {
    let run = [];
    for (let y = sy0; y <= sy1; y += DY) {
      const ok = gap() > 0.05 && streetOk(x, y) && streetOk(x, y + DY) && streetOk(x, y + DY / 2);
      if (ok) {
        if (!run.length) run.push(x, y);
        run.push(x, y + DY);
      } else if (run.length) {
        road('urbanroad', run, { minor: true });
        run = [];
      }
    }
    if (run.length) road('urbanroad', run, { minor: true });
  }

  // Docks, airport and hospital roads.
  road('restricted_road', [-7000, -1500, -4500, -1350]);
  road('restricted_road', [-6350, -1500, -6350, -900]);
  road('restricted_road', [-5650, -1400, -5650, -800]);
  road('enclosed_traffic_area_road', [-11000, 7900, -10600, 9800, -10500, 10600]);
  road('enclosed_traffic_area_road', [-10600, 9800, -12900, 9800]);
  road('enclosed_traffic_area_road', [1400, 1980, 2100, 1980]);

  // Paths through the parks and along the river.
  const path = (pts, seed) => road('footway', wobble(smooth(pts, 8), 18, seed));
  path([560, -820, 1100, -900, 1500, -1050, 1650, -1450, 2100, -1500, 2500, -1100], 31);
  path([900, -1800, 1300, -1550, 1700, -1450, 2300, -800, 2600, -500], 32);
  path([700, -600, 1400, -560, 2200, -560], 33);
  path([...G(-380, 700), ...G(0, 600), ...G(400, 700)], 34);
  path([-3200, 2100, -2700, 2500, -2300, 3300, -1700, 3500], 35);
  path([-3300, 3000, -2600, 2700, -1600, 2000], 36);
  road('footway', offsetLine(slice(riverLine, 0.48, 0.62), 70));

  // Rail: lines out of Central and Spencer Street, a yard between them.
  const central = G(250, -550);
  const spencer = G(-1000, -60);
  const railEast = smooth([...central, 1300, 230, 2300, 750, 3600, 1320, 6000, 2620, 12000, 4400, 21000, 6000], 8);
  road('railway', slice(railEast, 0, 0.25));
  road('suburban_train', slice(railEast, 0.24, 1));
  road('railway', smooth([...central, 1000, -700, 1450, -2300, 2500, -4500, 3800, -6400], 8));
  road('railway', smooth([...spencer, -1600, 600, -3000, 2500, -6000, 5500, -9000, 8200, -15000, 12000], 8));
  road('railway', smooth([...spencer, -2400, -500, -6000, -1200, -11000, -1800, -21000, -2200], 8));
  for (const d of [-14, 0, 14]) road('railway', offsetLine([...spencer, ...G(-700, -470), ...G(-60, -560), ...central], d));
  road('tramway', gridLine([[-900, 0], [900, 0]]));
  road('tramway', northern.slice());
  road('subway', gridLine([[-1000, -470], [-900, 470], [900, 470], [1000, -470]]));

  // Ferries, a creek and the canal.
  road('ferry', smooth([-5300, -2450, -6600, -4300, -8000, -6200, -8700, -6950], 6));
  road('ferry', smooth([-4100, -3100, -3000, -5600, -1000, -8000, 1500, -10500], 6));
  road('waterway', smooth([1600, 12500, 1100, 8500, 2100, 5200, 2700, 2900, 3150, 1050], 8), { name: 'Merri Creek' });

  // The route: up Kingsford Rd, across the river, into the CBD, along Regent St
  // to a stopover, then out along Victoria Pde. Leg 2 starts after the stopover.
  // Australia drives on the left, so the route keeps to the left carriageway of
  // the divided roads (offset 9 m, the same as their `dual` spacing).
  const vehicleV = -1750;
  const leg1 = offsetLine(gridLine([[0, vehicleV], [0, -9]]), 9).concat(gridLine([[0, 0], [900, 0]]));
  const leg2 = offsetLine(slice(eastern, 0, 0.82), 9);
  const route = [
    { pts: leg1, leg: 1, box: bbox(leg1) },
    { pts: leg2, leg: 2, box: bbox(leg2) },
  ];
  const vehicle = { x: G(0, vehicleV)[0], y: G(0, vehicleV)[1], heading: Math.PI / 2 + PHI };
  const stopover = { x: leg1[leg1.length - 2], y: leg1[leg1.length - 1] };
  const destination = along(leg2, 1);

  // Traffic: flow colours on the motorways, and two incidents.
  const flow = [];
  const addFlow = (line, f0, f1, kind, dual = 16) => {
    const pts = slice(line, f0, f1);
    flow.push({ pts, kind, cls: 'motorway', dual, box: bbox(pts) });
  };
  addFlow(m1, 0.05, 0.22, 'speed_and_flow_free_traffic');
  addFlow(m1, 0.22, 0.3, 'speed_and_flow_heavy_traffic');
  addFlow(m1, 0.3, 0.36, 'speed_and_flow_queuing_traffic');
  addFlow(m1, 0.36, 0.4, 'speed_and_flow_stationary_traffic');
  addFlow(m1, 0.4, 0.6, 'speed_and_flow_free_traffic');
  addFlow(m2, 0.36, 0.45, 'speed_and_flow_slow_traffic');
  addFlow(m2, 0.45, 0.62, 'speed_and_flow_free_traffic');
  addFlow(m3, 0.1, 0.6, 'speed_and_flow_unknown', 14);
  const events = [
    { pts: offsetLine(slice(eastern, 0.2, 0.34), 9), side: 'on_route', event: 'stationary_traffic', cls: 'dualcarriageway' },
    { pts: offsetLine(slice(m2, 0.36, 0.42), 16), side: 'off_route', event: 'queuing_traffic', cls: 'motorway' },
    { pts: offsetLine(slice(m1, 0.31, 0.37), -16), side: 'off_route', event: 'roadworks_on', cls: 'motorway' },
  ].map((e) => Object.assign(e, { box: bbox(e.pts) }));

  // Place names. `rank` decides which label wins when two overlap.
  const place = (kind, text, x, y, rank) => labels.push({ kind, text, x, y, rank });
  place('capital_city_label', 'Ellery', ...G(-260, 120), 0);
  place('city_label', 'Ellery CBD', ...G(380, -250), 1);
  place('city_label', 'Southgate', -1250, -1900, 2);
  place('city_label', 'Northbank', -900, 3700, 2);
  place('city_label', 'Port Hollis', -6000, -900, 2);
  place('city_label', 'Kensal', -6600, 4100, 2);
  place('city_label', 'Brookfield', 4300, 3400, 2);
  place('city_label', 'Fairhaven', 2300, -4300, 2);
  place('city_label', 'St Albury', 6200, -1300, 2);
  place('city_label', 'Westmere', -11200, 2200, 2);
  place('city_label', 'Greenvale', -3400, 9200, 2);
  place('city_label', 'Ridgeview', 14300, 7300, 3);
  place('city_label', 'Tullamore', 4200, 8400, 3);
  place('sea_label', 'Hollis Bay', -9500, -4600, 1);
  place('island_label', 'Gull Island', -9000, -7500, 3);
  const river1 = along(riverLine, 0.66);
  const river2 = along(riverLine, 0.3);
  place('river_label', 'Marra River', river1.x, river1.y, 4);
  place('river_label', 'Marra River', river2.x, river2.y, 4);
  place('polygon_label', 'Ornamental Lake', 1750, -1250, 5);
  place('waterway_label', 'Coode Canal', -4320, -1100, 5);

  // Every colour entry the sample city can show, for the "In the preview" filter.
  const drawn = new Set([
    'map_background',
    'sky_background',
    'fog',
    'building',
    'city_models',
    'bridge',
    'one_way_arrows',
    ...areas.map((a) => a.cls),
    ...lines.map((l) => l.cls),
    ...labels.map((l) => l.kind),
    'road_label',
    ...flow.map((f) => f.kind),
  ]);
  for (const l of lines) {
    if (l.bridges && l.bridges.length && /^(motorway|dualcarriageway|expressway|countryroad|urbanroad)$/.test(l.cls)) drawn.add(`${l.cls}_bridge`);
  }
  drawn.add('motorway_tunnel');
  drawn.add('motorway_toll');
  drawn.add('countryroad_seasonally_restricted');

  MIB.scene = {
    areas,
    lines,
    buildings: buildings.map((ring) => ({ ring, box: bbox(ring) })),
    labels,
    roadNames,
    route,
    vehicle,
    stopover,
    destination,
    flow,
    events,
    height,
    drawn,
    helpers: { along, slice, lineLength, offsetLine, bbox },
  };
})((window.MIB = window.MIB || {}));
