#!/usr/bin/env node
/**
 * Build Compose, then check the inspector, invoice issue, PDF, in-network
 * API, the hostname 308, OPTIONS 403, and reset.
 */
import {
  ROOT,
  assert,
  assertPdfText,
  capture,
  fail,
  fetchPdfJson,
  getJson,
  getText,
  issueInvoice,
  pdfBytesFrom,
  run,
} from './smoke-helpers.ts';

const BASE = process.env.DOKLADO_MOCK_BASE ?? 'http://127.0.0.1:3000';

let started = false;
let cleaning: Promise<void> | undefined;

async function compose(args: string[]): Promise<void> {
  await run('docker', ['compose', ...args], { cwd: ROOT });
}

async function composeCapture(args: string[]): Promise<string> {
  return capture('docker', ['compose', ...args], { cwd: ROOT });
}

async function cleanup(): Promise<void> {
  cleaning ??= (async () => {
    if (!started) return;
    started = false;
    try {
      await compose(['down', '--remove-orphans']);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  })();
  await cleaning;
}

function onSignal(code: number): void {
  void cleanup().finally(() => process.exit(code));
}
process.on('SIGINT', () => onSignal(130));
process.on('SIGTERM', () => onSignal(143));

type MockState = {
  success?: boolean;
  invoices: unknown[];
  counters: Array<{
    organizationId: string;
    series: Array<{ exportAbbreviation: string; nextCounter: number }>;
  }>;
};

async function main(): Promise<void> {
  started = true;
  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '120']);

  try {
    const html = await getText(`${BASE}/`);
    assert(
      html.includes('doklado-mock'),
      'Inspector did not contain doklado-mock',
    );
  } catch (error) {
    await compose(['logs']);
    throw error;
  }

  const state = (await getJson(`${BASE}/__mock/state`)) as MockState;
  assert(state.success === true, '__mock/state success=false');
  assert(state.invoices.length === 0, '__mock/state invoices should be empty');
  assert(
    state.counters[0]?.organizationId === '12345678',
    'unexpected organisation id',
  );
  assert(
    state.counters[0]?.series[0]?.exportAbbreviation === 'FA',
    'unexpected series abbreviation',
  );

  const { documentId, invoiceNumber } = await issueInvoice(
    BASE,
    'test-api-key',
    '12345678',
  );
  assert(invoiceNumber, 'invoiceNumber missing');

  const first = await fetchPdfJson(
    BASE,
    'test-api-key',
    '12345678',
    documentId,
  );
  const second = await fetchPdfJson(
    BASE,
    'test-api-key',
    '12345678',
    documentId,
  );
  assert(first.data?.encoding === 'base64', 'PDF encoding');
  assert(first.data?.data === second.data?.data, 'PDF bytes should be stable');
  const pdf = pdfBytesFrom(first);
  await assertPdfText(pdf, (text) => {
    assert(text.includes('2'), 'PDF missing quantity');
    assert(text.includes('246.00 EUR'), 'PDF missing total');
    assert(!text.includes('492.00'), 'PDF should not double-count VAT');
  });

  await compose([
    'exec',
    '-T',
    'doklado-mock',
    'node',
    '-e',
    `fetch("http://doklado-mock:3000/__mock/state").then(async (response) => {
  if (!response.ok) process.exit(1);
  const body = await response.json();
  if (!body.success || body.invoices.length !== 1) process.exit(1);
}).catch(() => process.exit(1));`,
  ]);

  const inspectorStatus = (
    await composeCapture([
      'exec',
      '-T',
      'doklado-mock',
      'node',
      '-e',
      `fetch("http://doklado-mock:3000/", { redirect: "manual" }).then((response) => {
  process.stdout.write(String(response.status));
}).catch(() => process.exit(1));`,
    ])
  ).trim();
  if (inspectorStatus !== '308') {
    fail(`Inspector on doklado-mock should 308, got ${inspectorStatus}`);
  }

  const options = await fetch(`${BASE}/v1/documents/invoice-issue`, {
    method: 'OPTIONS',
  });
  if (options.status !== 403) {
    fail(`OPTIONS should be 403, got ${options.status}`);
  }
  const optionsBody = await options.text();
  assert(optionsBody.includes('Unauthorized!'), 'OPTIONS body');

  const reset = await fetch(`${BASE}/__mock/reset`, { method: 'POST' });
  if (!reset.ok) fail(`__mock/reset -> HTTP ${reset.status}`);
  const resetState = (await getJson(`${BASE}/__mock/state`)) as MockState;
  assert(resetState.invoices.length === 0, 'reset left invoices');
  assert(
    resetState.counters[0]?.series[0]?.nextCounter === 1,
    'reset did not restore counter',
  );

  console.log('Docker Compose smoke passed');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
