// Running ssh and scp against the head unit, which is set up as the SSH host "mib2" (see the README).
const { spawnSync } = require('child_process');

const HOST = 'mib2';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Runs a command with its output shown and returns its exit code.
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    if (result.error.code === 'ENOENT') fail(`${command} isn't installed, or isn't on the PATH.`);
    throw result.error;
  }
  return result.status;
}

// Runs a shell command on the head unit. ssh exits with 255 when it can't connect.
const ssh = (command, options) => run('ssh', [HOST, command], options);
const scp = (args, options) => run('scp', args, options);
const CANT_CONNECT = 255;

// yyyyMMdd-HHmmss in local time, for backup and screenshot names.
function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

module.exports = { HOST, CANT_CONNECT, fail, run, ssh, scp, timestamp };
