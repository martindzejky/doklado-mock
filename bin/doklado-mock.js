#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

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
 * @param {string} value
 * @returns {string}
 */
function resolveFromCwd(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

/**
 * @returns {{ port?: string, host?: string, config?: string }}
 */
function parseCli() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(help());
    process.exit(0);
  }

  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        port: { type: 'string' },
        host: { type: 'string' },
        config: { type: 'string' },
      },
    });
    return values;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error(help());
    process.exit(1);
  }
}

const { port, host, config } = parseCli();

if (!existsSync(server)) {
  console.error('Error: production build not found.');
  console.error('If you are in the source repository, run pnpm build first.');
  process.exit(1);
}

process.env.PORT = port ?? process.env.PORT ?? '3000';
process.env.HOST = host ?? process.env.HOST ?? '127.0.0.1';
if (config) process.env.DOKLADO_MOCK_CONFIG = resolveFromCwd(config);

await import(pathToFileURL(server).href);
