#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'build/index.js');

function help() {
  return `Usage:
  doklado-mock [--port 3000] [--host 0.0.0.0] [--config ./doklado-mock.config.json]

Options:
  --port     Listen port (default: 3000, or PORT)
  --host     Listen host (default: 127.0.0.1, or HOST)
  --config   Path to config JSON (or DOKLADO_MOCK_CONFIG)
  --help     Show this help

Examples:
  doklado-mock
  doklado-mock --port 4010 --config ./doklado-mock.config.json
  pnpm build && doklado-mock --port 3000
`;
}

/**
 * @param {string[]} argv
 * @param {string} name
 * @returns {string | undefined}
 */
function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    console.error(`Error: ${name} requires a value.`);
    console.error(help());
    process.exit(1);
  }
  return value;
}

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(help());
  process.exit(0);
}

const known = new Set(['--port', '--host', '--config', '--help', '-h']);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith('-')) {
    console.error(`Error: unexpected argument ${arg}.`);
    console.error(help());
    process.exit(1);
  }
  if (!known.has(arg)) {
    console.error(`Error: unknown option ${arg}.`);
    console.error(help());
    process.exit(1);
  }
  if (arg === '--port' || arg === '--host' || arg === '--config') i += 1;
}

if (!existsSync(server)) {
  console.error('Error: production build not found.');
  console.error('  pnpm build && doklado-mock --port 3000');
  process.exit(1);
}

const port = readArg(argv, '--port') ?? process.env.PORT ?? '3000';
const host = readArg(argv, '--host') ?? process.env.HOST ?? '127.0.0.1';
const config = readArg(argv, '--config') ?? process.env.DOKLADO_MOCK_CONFIG;

const env = {
  ...process.env,
  PORT: port,
  HOST: host,
};
if (config) env.DOKLADO_MOCK_CONFIG = config;

const child = spawn(process.execPath, [server], {
  cwd: root,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
