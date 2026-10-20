#!/usr/bin/env node
// Saves a screenshot of the head unit's main display to screenshots/.
//
//   node utilities/screenshot.js           the main display
//   node utilities/screenshot.js --kombi   the VW cluster map
//
// The cluster has no screenshot of its own, so --kombi switches display 0 to the cluster map's
// display context (-3), takes the screenshot and switches it back. That context is VW's and hasn't
// been checked with the Audi Virtual Cockpit.
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const { HOST, CANT_CONNECT, fail, ssh, scp, timestamp } = require('./lib/head-unit');

const ROOT = path.resolve(__dirname, '..');
const DMDT = '/eso/bin/apps/dmdt';
const ENV = 'export LD_LIBRARY_PATH=/eso/lib; export IPL_CONFIG_DIR=/etc/eso/production;';

let opt;
try {
  opt = parseArgs({ options: { kombi: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }).values;
} catch (err) {
  fail(err.message);
}
if (opt.help) {
  console.log('Usage: node utilities/screenshot.js [--kombi]');
  process.exit(0);
}

const screenshotDir = path.join(ROOT, 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });
const name = `${timestamp()}${opt.kombi ? '_kombi' : ''}.png`;

console.log('Taking screenshot');
const capture = opt.kombi ? `${DMDT} sc 0 -3;${DMDT} ts 0 /tmp/sc.png;${DMDT} sb 0;` : `${DMDT} ts 0 /tmp/sc.png;`;
if (ssh(`${ENV} ${capture}`) === CANT_CONNECT) fail(`Couldn't connect to the head unit (ssh ${HOST}). Check the SSH setup in the README.`);

console.log('Copying');
if (scp([`${HOST}:/tmp/sc.png`, name], { cwd: screenshotDir }) !== 0) fail("The screenshot couldn't be copied from the head unit.");
console.log(`Saved screenshots/${name}`);
