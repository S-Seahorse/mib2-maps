#!/usr/bin/env node
// Builds a deploy folder from a map style folder and, with --deploy, copies it to the head unit, or
// with --sd, writes it to an SD card for the LoadStylesFromSDCard method.
//
// Set up for the 2017 Audi A4 with MMI Navigation plus (Australia): it stages the stock Audi
// styles in mapstyles-audidefault, swaps in MapConfigs exported from the previewer
// (--map-configs) or an alternate style from mapstyles-alt (--style), and copies the result to
// the head unit over SSH.
//
// The Audi style folder on the head unit hasn't been confirmed on an A4 yet. Run with --list to
// see the map style folders on the unit, then pass the right one with --dest-path. Deploying stops
// if that folder doesn't exist, so nothing lands in the wrong place.
//
// The navigation uses the copy of the map style with the highest version in version-cfg.txt (on the
// head unit, in the map database, or on an SD card), so a style gets a raised version to win.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs } = require('util');
const { HOST, CANT_CONNECT, fail, run, ssh, scp, timestamp } = require('./lib/head-unit');
const { MIB } = require('./lib/previewer');

const ROOT = path.resolve(__dirname, '..');
const NAV_ROOT = '/mnt/app/navigation/resources/app/';
const DEFAULT_DEST = `${NAV_ROOT}audi/aus/`;
const APP_MOUNT = '/net/mmx/mnt/app';

const USAGE = `Usage: node utilities/deploy.js [options]

  --style <id>          an alternate style from mapstyles-alt (see its index.json)
  --map-configs <dir>   MapConfigs exported from the previewer (the unzipped folder)
  --styles <dir>        the stock style folder to start from (default mapstyles-audidefault,
                        or mapstyles for a --style built on the VW styles)
  --vw-builder          build MapConfigs with mib2-mapbuilder (VW Discover Pro only)
  --deploy              copy the staged folder to the head unit
  --backup              with --deploy, first copy what's on the head unit to backup/
  --dest-path <path>    the map style folder on the head unit (default ${DEFAULT_DEST})
  --sd <card>           write the staged folder to the root of an SD card instead, for the
                        LoadStylesFromSDCard method (only the style's own items there are replaced)
  --keep-version        keep the stock version-cfg.txt; by default a style gets a version above
                        any stock one, so the navigation uses it
  --list                list the map style folders on the head unit
  -h, --help            show this help

Without --deploy or --sd, the style is only staged in deploy/, to look over first.`;

let opt;
try {
  opt = parseArgs({
    options: {
      style: { type: 'string' },
      'map-configs': { type: 'string' },
      styles: { type: 'string' },
      'vw-builder': { type: 'boolean' },
      deploy: { type: 'boolean' },
      backup: { type: 'boolean' },
      'dest-path': { type: 'string', default: DEFAULT_DEST },
      sd: { type: 'string' },
      'keep-version': { type: 'boolean' },
      list: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(1);
}
if (opt.help) {
  console.log(USAGE);
  process.exit(0);
}

let destPath = opt['dest-path'];
if (!destPath.endsWith('/')) destPath += '/';

if (opt.list) {
  console.log('Map style folders on the head unit:');
  process.exit(ssh(`ls -d ${NAV_ROOT}*/*/`));
}

let styles = opt.styles || 'mapstyles-audidefault';
let mapConfigs = opt['map-configs'] ? path.resolve(opt['map-configs']) : '';

// An alternate style is a MapConfigs folder in mapstyles-alt, listed in its index.json with the
// stock set it's built on.
if (opt.style) {
  if (mapConfigs) fail('Pass --style or --map-configs, not both.');
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'mapstyles-alt/index.json'), 'utf8'));
  const entry = (index.styles || []).find((s) => s.id === opt.style);
  if (!entry) fail(`There's no style '${opt.style}' in mapstyles-alt/index.json.`);
  mapConfigs = path.join(ROOT, 'mapstyles-alt', entry.id);
  if (!opt.styles && entry.base === 'vw') styles = 'mapstyles';
  console.log(`Style: ${entry.name} (mapstyles-alt/${entry.id})`);
}

const styleSrc = path.resolve(ROOT, styles);
const stagingDir = path.join(ROOT, 'deploy');
const mapBuilder = path.join(ROOT, 'mib2-mapbuilder');
const backupDir = path.join(ROOT, 'backup', timestamp());

if (!fs.existsSync(styleSrc)) fail(`Style folder not found: ${styleSrc}`);
if (opt.sd && opt.deploy) fail('Pass --deploy or --sd, not both.');
const card = opt.sd ? checkCard(opt.sd) : null;
if (opt.backup && !opt.deploy) console.log('Note: --backup only applies with --deploy.');

console.log('Directories:');
console.log(`--> Style source: ${styleSrc}`);
console.log(`--> Staging target: ${stagingDir}`);
if (card) console.log(`--> SD card: ${card}`);
if (opt.deploy) {
  console.log(`--> Head unit target: ${destPath}`);
  if (opt.backup) console.log(`--> Backup target: ${backupDir}`);
}

console.log('Begin staging build');
console.log('--> Emptying the staging folder');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

// The style folder is a copy of the one on the head unit, so stage all of it.
console.log(`--> Copying ${styles}`);
const skip = (name) => name === '.DS_Store' || /\.md$/i.test(name);
fs.cpSync(styleSrc, stagingDir, { recursive: true, filter: (src) => src === styleSrc || !skip(path.basename(src)) });

if (opt['vw-builder']) {
  // mib2-mapbuilder only writes VW Discover Pro configs (1280x640 and kombi files).
  console.log('--> Building MapConfigs with mib2-mapbuilder');
  if (!fs.existsSync(path.join(mapBuilder, 'package.json'))) fail('mib2-mapbuilder is empty. It is a git submodule: run git submodule update --init.');
  // npm is a script on Windows, so it runs through the shell.
  if (run('npm run --silent buildmaps', [], { cwd: mapBuilder, shell: true }) !== 0) fail('mib2-mapbuilder failed to build the MapConfigs.');
  fs.cpSync(path.join(mapBuilder, 'rendered'), path.join(stagingDir, 'MapConfigs'), { recursive: true, force: true });
}

// The SD card's folder, after checking it isn't this repository or a folder holding your home folder.
function checkCard(dir) {
  const card = path.resolve(dir);
  const holds = (outer, inner) => inner === outer || inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);
  if (!fs.existsSync(card) || !fs.statSync(card).isDirectory()) fail(`SD card folder not found: ${card}`);
  if (holds(card, ROOT) || holds(ROOT, card)) fail(`${card} is this repository, or holds it, rather than an SD card.`);
  if (holds(card, os.homedir())) fail(`${card} holds your home folder, so it isn't an SD card.`);
  return card;
}

// Every file under a folder, as paths relative to it.
function filesUnder(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((d) => {
    const p = path.join(rel, d.name);
    return d.isDirectory() ? filesUnder(dir, p) : d.isFile() ? [p] : [];
  });
}

if (mapConfigs) {
  // Accept the unzipped export (which holds a MapConfigs folder) or the MapConfigs folder itself.
  let configSrc = mapConfigs;
  if (fs.existsSync(path.join(configSrc, 'MapConfigs'))) configSrc = path.join(configSrc, 'MapConfigs');
  if (!fs.existsSync(configSrc) || !fs.statSync(configSrc).isDirectory()) fail(`MapConfigs folder not found: ${mapConfigs}`);
  console.log(`--> Using MapConfigs from ${configSrc}`);
  let unpacked = 0;
  for (const rel of filesUnder(configSrc).filter((p) => /\.mxf(\.gz)?$/i.test(p))) {
    const target = path.join(stagingDir, 'MapConfigs', rel);
    // An unpacked .mxf replaces the stock .mxf.gz of the same name, and the other way round.
    const gz = /\.gz$/i.test(target);
    const twin = gz ? target.slice(0, -3) : `${target}.gz`;
    if (!gz && fs.existsSync(twin)) unpacked += 1;
    fs.rmSync(twin, { force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(configSrc, rel), target);
    console.log(`    ${rel.split(path.sep).join('/')}`);
  }
  if (unpacked > 0) {
    console.warn(
      `Warning: ${unpacked} unpacked .mxf files replace .mxf.gz files. Copying doesn't delete the .mxf.gz files already on the head unit; export with the original .mxf.gz names to replace them.`
    );
  }
}

console.log('--> Storing the commit point in commit.txt');
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
fs.writeFileSync(path.join(stagingDir, 'commit.txt'), git.status === 0 ? git.stdout : 'unknown\n');

// Stock styles deployed to the head unit keep their version, so they don't hold back newer ones from
// a map update. A style, or anything on a card, is meant to be used.
const versionFile = path.join(stagingDir, 'version-cfg.txt');
if ((mapConfigs || opt['vw-builder'] || card) && !opt['keep-version'] && fs.existsSync(versionFile)) {
  const before = fs.readFileSync(versionFile, 'utf8');
  const after = MIB.library.raisedVersion(before);
  fs.writeFileSync(versionFile, after);
  console.log(`--> Raising the version in version-cfg.txt so the navigation uses this style: ${before.trim()} -> ${after.trim()}`);
}

console.log('Staging build complete');

if (card) {
  console.log('Begin writing to the SD card');
  try {
    // The card's root is the style folder, so replace the style there and leave everything else.
    const { items: old, error } = MIB.library.styleItemsToReplace(fs.readdirSync(card));
    if (error) fail(`Nothing was written to ${card}. ${error}`);
    for (const name of old) fs.rmSync(path.join(card, name), { recursive: true, force: true });
    if (old.length) console.log(`--> Removed the style already on the card: ${old.join(', ')}`);
    console.log('--> Copying the style folder to the card');
    for (const name of fs.readdirSync(stagingDir)) fs.cpSync(path.join(stagingDir, name), path.join(card, name), { recursive: true });
  } catch (err) {
    fail(`Writing to the SD card failed: ${err.message}`);
  }
  console.log('SD card ready. The head unit needs the LoadStylesFromSDCard flag (see the README); then put the card');
  console.log('in an SD slot and restart the MMI. Without the card, the navigation goes back to its own style.');
}

if (opt.deploy) {
  console.log('Begin deploy to the head unit');
  const found = ssh(`test -d ${destPath}`);
  if (found === CANT_CONNECT) fail(`Couldn't connect to the head unit (ssh ${HOST}). Check the SSH setup in the README.`);
  if (found !== 0) fail(`${destPath} doesn't exist on the head unit. Run with --list to find the map style folder and pass it with --dest-path.`);
  if (opt.backup) {
    console.log('--> Performing backup');
    fs.mkdirSync(backupDir, { recursive: true });
    if (scp(['-r', `${HOST}:${destPath}`, '.'], { cwd: backupDir }) !== 0) {
      fail(`The backup didn't finish, so nothing was changed on the head unit. What was copied is in ${backupDir}.`);
    }
  }
  console.log('--> Making the mount point writable');
  if (ssh(`mount -uw ${APP_MOUNT}`) !== 0) fail(`Couldn't remount ${APP_MOUNT} read-write, so nothing was copied.`);

  console.log('--> Copying to the head unit');
  // Run from the staging folder and name its items, so no local path is mistaken for a host.
  const copied = scp(['-r', ...fs.readdirSync(stagingDir), `${HOST}:${destPath}`], { cwd: stagingDir });

  console.log('--> Making the mount point read-only');
  ssh(`mount -ur ${APP_MOUNT}`);
  if (copied !== 0) {
    const restore = opt.backup ? ` The backup is in ${backupDir}.` : '';
    fail(`Copying didn't finish, so AppStartATF wasn't restarted. The head unit may have some of the new files.${restore}`);
  }

  console.log('--> Restarting AppStartATF');
  ssh('slay AppStartATF');
  console.log('Deploy complete');
}
console.log('Finished');
