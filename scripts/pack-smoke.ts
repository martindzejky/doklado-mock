#!/usr/bin/env node
/**
 * Pack the npm tarball, install it in a throwaway consumer, and check
 * zero-config, --config from the caller cwd, and HOST/PORT/DOKLADO_MOCK_CONFIG.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  ROOT,
  assert,
  assertPdfText,
  capture,
  ensureExecutable,
  fail,
  fetchPdfJson,
  issueInvoice,
  pdfBytesFrom,
  postJson,
  run,
  stopChild,
  waitForInspector,
} from './smoke-helpers.ts';

const CALLER_CONFIG = `{
  "apiKeys": ["pack-smoke-key"],
  "organisations": [
    {
      "id": "11111111",
      "name": "Caller s.r.o.",
      "country": "SK",
      "homeCurrency": "EUR",
      "email": "invoices@caller.sk",
      "bank": {
        "iban": "SK3112000000198742637541",
        "bic": "GIBASKBX"
      },
      "series": [
        {
          "name": "Issued invoices",
          "mask": "#RRRRCCC",
          "exportAbbreviation": "FA",
          "counter": 1,
          "default": true
        }
      ]
    }
  ],
  "exchangeRates": { "EUR": 1 }
}
`;

let consumer = '';
let packOut = '';
let server: ChildProcess | undefined;
let serverBase = '';
let cleaning: Promise<void> | undefined;

async function cleanup(): Promise<void> {
  cleaning ??= runCleanup();
  await cleaning;
}

async function runCleanup(): Promise<void> {
  try {
    await stopChild(server, serverBase);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  server = undefined;
  if (consumer) await rm(consumer, { recursive: true, force: true });
  if (packOut) await rm(packOut, { recursive: true, force: true });
}

function onSignal(code: number): void {
  void cleanup().finally(() => process.exit(code));
}
process.on('SIGINT', () => onSignal(130));
process.on('SIGTERM', () => onSignal(143));

function lastLine(text: string): string {
  const lines = text.trim().split('\n');
  return lines[lines.length - 1] ?? '';
}

function startCli(
  bin: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): ChildProcess {
  return spawn(bin, args, { cwd, env, stdio: 'inherit' });
}

async function assertInvoicePdf(
  base: string,
  apiKey: string,
  organizationId: string,
  documentId: string,
): Promise<void> {
  const body = await fetchPdfJson(base, apiKey, organizationId, documentId);
  const pdf = pdfBytesFrom(body);
  await assertPdfText(pdf);
}

async function main(): Promise<void> {
  console.log('Packing npm tarball');
  packOut = await mkdtemp(join(tmpdir(), 'doklado-mock-pack-'));
  const packOutput = await capture(
    'pnpm',
    ['pack', '--pack-destination', packOut],
    { cwd: ROOT },
  );
  process.stdout.write(packOutput);
  let tarball = lastLine(packOutput);
  if (!existsSync(tarball)) tarball = join(packOut, basename(tarball));
  assert(existsSync(tarball), `tarball missing: ${tarball}`);
  console.log(`Tarball: ${tarball}`);

  const contents = await capture('tar', ['-tzf', tarball]);
  process.stdout.write(contents);
  const members = contents.trim().split('\n');

  const requireMember = (path: string) => {
    if (!members.includes(path)) fail(`npm pack missing ${path}`);
  };
  const forbidPrefix = (prefix: string) => {
    if (members.some((path) => path.startsWith(prefix))) {
      fail(`npm pack should not include ${prefix}`);
    }
  };

  requireMember('package/package.json');
  requireMember('package/bin/doklado-mock.js');
  requireMember('package/build/index.js');
  requireMember('package/doklado-mock.config.example.json');
  requireMember('package/LICENSE');
  requireMember('package/README.md');
  if (!members.some((path) => path.startsWith('package/build/client/'))) {
    fail('npm pack missing build/client browser assets');
  }
  if (!members.some((path) => path.startsWith('package/build/server/'))) {
    fail('npm pack missing build/server');
  }
  forbidPrefix('package/src/');
  forbidPrefix('package/node_modules/');
  forbidPrefix('package/.svelte-kit/');
  forbidPrefix('package/scripts/');
  forbidPrefix('package/spec/');

  consumer = await mkdtemp(join(tmpdir(), 'doklado-mock-consumer-'));
  console.log(`Installing into ${consumer}`);
  await run('npm', ['init', '-y'], { cwd: consumer, stdio: 'ignore' });
  await run('npm', ['install', '--omit=dev', tarball], { cwd: consumer });

  const bin = join(consumer, 'node_modules/.bin/doklado-mock');
  await ensureExecutable(bin);
  assert(
    existsSync(
      join(
        consumer,
        'node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff',
      ),
    ),
    'missing Noto Sans latin woff',
  );
  assert(
    existsSync(
      join(
        consumer,
        'node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff',
      ),
    ),
    'missing Noto Sans latin-ext woff',
  );
  assert(
    !existsSync(join(consumer, 'node_modules/vite')),
    'vite should not be installed',
  );
  assert(
    !existsSync(join(consumer, 'node_modules/@sveltejs/kit')),
    '@sveltejs/kit should not be installed',
  );
  assert(
    !existsSync(join(consumer, 'node_modules/lefthook')),
    'lefthook should not be installed',
  );

  const help = await capture(bin, ['--help']);
  process.stdout.write(help);
  assert(
    help.includes('npx @martindzejky/doklado-mock'),
    'help text missing package name',
  );

  let port = 3410;
  let base = `http://127.0.0.1:${port}`;

  console.log('Zero-config startup');
  serverBase = base;
  server = startCli(
    bin,
    ['--port', String(port), '--host', '127.0.0.1'],
    consumer,
  );
  await waitForInspector(base);
  const zero = await issueInvoice(base, 'test-api-key', '12345678');
  await assertInvoicePdf(base, 'test-api-key', '12345678', zero.documentId);
  await stopChild(server, base);
  server = undefined;

  console.log('Explicit config from the caller directory');
  const configPath = join(consumer, 'caller.config.json');
  await writeFile(configPath, CALLER_CONFIG);
  server = startCli(
    bin,
    [
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
      '--config',
      './caller.config.json',
    ],
    consumer,
  );
  await waitForInspector(base);
  const wrong = await postJson(
    `${base}/v1/documents/invoice-issue`,
    {
      data: {
        organizationId: '11111111',
        type: 'issued_invoice',
        items: [
          {
            name: 'X',
            unitPriceWithoutVat: 1,
            vatRate: 0,
            quantity: 1,
          },
        ],
        customer: { name: 'Pat', countryCode: 'sk' },
      },
    },
    { api_key: 'test-api-key' },
  );
  if (wrong.status !== 401) {
    fail(
      `Expected 401 for the default api_key against caller config, got ${wrong.status}\n${wrong.text}`,
    );
  }
  const configured = await issueInvoice(base, 'pack-smoke-key', '11111111');
  await assertInvoicePdf(
    base,
    'pack-smoke-key',
    '11111111',
    configured.documentId,
  );
  await stopChild(server, base);
  server = undefined;

  console.log('Environment variables');
  port = 3411;
  base = `http://127.0.0.1:${port}`;
  serverBase = base;
  server = startCli(bin, [], consumer, {
    ...process.env,
    DOKLADO_MOCK_CONFIG: configPath,
    PORT: String(port),
    HOST: '127.0.0.1',
  });
  await waitForInspector(base);
  await issueInvoice(base, 'pack-smoke-key', '11111111');
  await stopChild(server, base);
  server = undefined;

  console.log('npm pack smoke passed');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
