#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  npx @martindzejky/doklado-mock
  doklado-mock --port 4010 --config ./doklado-mock.config.json
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

/**
 * @param {string} value
 * @returns {string}
 */
function resolveFromCwd(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
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
  console.error('If you are in the source repository, run pnpm build first.');
  process.exit(1);
}

const port = readArg(argv, '--port') ?? process.env.PORT ?? '3000';
const host = readArg(argv, '--host') ?? process.env.HOST ?? '127.0.0.1';
const config = readArg(argv, '--config') ?? process.env.DOKLADO_MOCK_CONFIG;

process.env.PORT = port;
process.env.HOST = host;
if (config) process.env.DOKLADO_MOCK_CONFIG = resolveFromCwd(config);

await import(pathToFileURL(server).href);
