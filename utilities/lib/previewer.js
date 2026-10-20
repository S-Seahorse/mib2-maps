// Loads the previewer's MapConfig code (previewer/js) in Node, so the command-line tools read and
// write map styles exactly as the previewer does.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

// The previewer's scripts are browser scripts that add to window.MIB; these ones don't need a page.
function load(names) {
  const window = {};
  for (const name of names) new Function('window', fs.readFileSync(path.join(ROOT, 'previewer/js', name), 'utf8'))(window);
  return window.MIB;
}

module.exports = { ROOT, MIB: load(['util.js', 'mxf.js', 'library.js']) };
