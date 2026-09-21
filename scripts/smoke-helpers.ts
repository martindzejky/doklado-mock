import {
  execFileSync,
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';
import { access, constants, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function fail(message: string): never {
  throw new Error(message);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function explainFetch(url: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? `: ${error.cause.message}`
      : '';
  fail(`${url}: ${message}${cause}`);
}

export function run(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

export function capture(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        const detail = stderr.trim() || stdout.trim();
        reject(
          new Error(
            `${command} ${args.join(' ')} exited ${code}${detail ? `\n${detail}` : ''}`,
          ),
        );
      }
    });
  });
}

function popplerAvailable(): boolean {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    execFileSync('pdffonts', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    if (process.env.CI === 'true') {
      fail('poppler-utils is required in CI to read invoice PDFs');
    }
    return false;
  }
}

function invoicePayload(organizationId: string) {
  return {
    data: {
      organizationId,
      type: 'issued_invoice',
      paid: true,
      paymentType: 'card',
      note: 'Ďakujeme za včasnú úhradu.',
      items: [
        {
          name: 'Workshop',
          unitPriceWithoutVat: 100,
          vatRate: 23,
          quantity: 2,
        },
      ],
      customer: {
        name: 'Ján Novák',
        ico: '87654321',
        countryCode: 'sk',
      },
    },
  };
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown; text: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (error) {
    explainFetch(url, error);
  }
  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, json, text };
}

export async function getText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    explainFetch(url, error);
  }
  if (!response.ok) fail(`${url} -> HTTP ${response.status}`);
  return response.text();
}

export async function getJson(url: string): Promise<unknown> {
  return JSON.parse(await getText(url));
}

type IssueBody = {
  success?: boolean;
  data?: { documentId?: string; invoiceNumber?: string };
};

export async function issueInvoice(
  base: string,
  apiKey: string,
  organizationId: string,
): Promise<{ documentId: string; invoiceNumber?: string }> {
  const { status, json, text } = await postJson(
    `${base}/v1/documents/invoice-issue`,
    invoicePayload(organizationId),
    { api_key: apiKey },
  );
  if (status !== 200) fail(`invoice-issue -> HTTP ${status}: ${text}`);
  const body = json as IssueBody;
  assert(body.success === true, `invoice-issue success=false: ${text}`);
  assert(body.data?.documentId, 'invoice-issue missing documentId');
  return {
    documentId: body.data.documentId,
    invoiceNumber: body.data.invoiceNumber,
  };
}

type PdfBody = {
  success?: boolean;
  data?: { 'Content-Type'?: string; encoding?: string; data?: string };
};

export async function fetchPdfJson(
  base: string,
  apiKey: string,
  organizationId: string,
  documentId: string,
): Promise<PdfBody> {
  const { status, json, text } = await postJson(
    `${base}/v1/documents/get-invoice-pdf`,
    { data: { organizationId, documentId } },
    { api_key: apiKey },
  );
  if (status !== 200) fail(`get-invoice-pdf -> HTTP ${status}: ${text}`);
  return json as PdfBody;
}

export function pdfBytesFrom(body: PdfBody): Buffer {
  assert(body.success === true, 'PDF response success=false');
  assert(body.data?.['Content-Type'] === 'application/pdf', 'PDF Content-Type');
  assert(typeof body.data.data === 'string', 'PDF data missing');
  const pdf = Buffer.from(body.data.data, 'base64');
  assert(pdf.subarray(0, 5).toString() === '%PDF-', 'PDF magic');
  assert(pdf.length > 1000, 'PDF too small');
  return pdf;
}

export async function assertPdfText(
  pdf: Buffer,
  extra?: (text: string) => void,
): Promise<void> {
  if (!popplerAvailable()) return;
  const dir = await mkdtemp(join(tmpdir(), 'doklado-mock-pdf-'));
  const pdfPath = join(dir, 'invoice.pdf');
  try {
    await writeFile(pdfPath, pdf);
    const fonts = execFileSync('pdffonts', [pdfPath], { encoding: 'utf8' });
    assert(/NotoSans/i.test(fonts), 'expected NotoSans in pdffonts');
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
    });
    assert(text.includes('Faktúra'), 'PDF missing Faktúra');
    assert(text.includes('Ján Novák'), 'PDF missing customer');
    assert(text.includes('Ďakujeme za včasnú úhradu.'), 'PDF missing note');
    assert(text.includes('Workshop'), 'PDF missing item');
    extra?.(text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function waitForInspector(base: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const html = await (await fetch(`${base}/`)).text();
      if (html.includes('doklado-mock')) return;
    } catch {
      // not ready
    }
    await sleep(1000);
  }
  fail(`Server at ${base} did not respond in time`);
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function stopChild(
  child: ChildProcess | undefined,
  base: string,
): Promise<void> {
  if (!child?.pid) return;
  if (!hasExited(child)) {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
  if (!(await waitForExit(child, 5000))) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
    if (!(await waitForExit(child, 2000))) {
      fail(`Server at ${base} did not exit after SIGKILL`);
    }
  }
  try {
    const response = await fetch(`${base}/`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) fail(`Server at ${base} is still running after stop`);
  } catch {
    // expected: connection refused
  }
}

export async function ensureExecutable(path: string): Promise<void> {
  await access(path, constants.X_OK);
}
