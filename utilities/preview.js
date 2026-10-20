#!/usr/bin/env node
// Serves the repo folder on this computer and opens the Map Style Lab (previewer/) in the browser.
//
//   node utilities/preview.js               http://localhost:8000/previewer/
//   node utilities/preview.js --port 8080   another port
//   node utilities/preview.js --no-open     don't open the browser
//
// The previewer reads the style folders next to it, which browsers don't allow for a page opened
// straight from disk, so it needs to be served. Only this computer can reach the server.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { parseArgs } = require('util');

const ROOT = path.resolve(__dirname, '..');
const PAGE = '/previewer/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.fcx': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.gz': 'application/gzip',
};

let opt;
try {
  opt = parseArgs({ options: { port: { type: 'string', default: '8000' }, 'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }).values;
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
if (opt.help) {
  console.log('Usage: node utilities/preview.js [--port 8000] [--no-open]');
  process.exit(0);
}
const port = Number(opt.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Error: ${opt.port} isn't a port number.`);
  process.exit(1);
}

// The file a request asks for, or null when it's outside the repo or hidden (.git and the like).
function fileFor(urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath);
  } catch (_) {
    return null;
  }
  if (rel.includes('\0') || rel.split('/').some((part) => part.startsWith('.') && part !== '')) return null;
  const file = path.join(ROOT, rel);
  return file === ROOT || file.startsWith(ROOT + path.sep) ? file : null;
}

function send(res, status, text, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Only GET and HEAD are served.', { Allow: 'GET, HEAD' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') return send(res, 302, '', { Location: PAGE });
  let file = fileFor(url.pathname);
  if (!file) return send(res, 404, 'Not found.');
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) {
      // Pages refer to their files relative to the folder, so folders need the trailing slash.
      if (!url.pathname.endsWith('/')) return send(res, 301, '', { Location: `${url.pathname}/${url.search}` });
      file = path.join(file, 'index.html');
      try {
        stat = fs.statSync(file);
      } catch (e) {
        err = e;
      }
    }
    if (err || !stat.isFile()) return send(res, 404, 'Not found.');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log('Open the address above in your browser.'));
    child.unref();
  } catch (_) {
    console.log('Open the address above in your browser.');
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: port ${port} is already in use. If the Style Lab is already running, open http://localhost:${port}${PAGE}; otherwise pick another port with --port.`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}${PAGE}`;
  console.log(`Map Style Lab: ${url}`);
  console.log('Press Ctrl+C to stop.');
  if (!opt['no-open']) openBrowser(url);
});
