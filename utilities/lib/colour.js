// Colour helpers for the palettes in utilities/palettes. Colours are #RRGGBB or #RRGGBBAA.
const { MIB } = require('./previewer');

const { hexToRgba, rgbaToHex, normaliseHex } = MIB.util;

// The colour as #RRGGBBAA.
function hex(colour) {
  const h = normaliseHex(colour);
  if (!h) throw new Error(`Not a colour: ${colour}`);
  return h;
}

// a mixed towards b by t, from 0 (all a) to 1 (all b).
function mix(a, b, t) {
  const x = hexToRgba(hex(a));
  const y = hexToRgba(hex(b));
  return rgbaToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });
}

// The colour with its opacity set to a, from 0 to 1.
const alpha = (colour, a) => hex(colour).slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();

// Terrain colours by height: stops are [[metres, colour], ...], low to high, and heights between
// two stops get a mix of the two.
function tint(stops) {
  return (h) => {
    if (h <= stops[0][0]) return hex(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    }
    return hex(stops[stops.length - 1][1]);
  };
}

module.exports = { hex, mix, alpha, tint };
