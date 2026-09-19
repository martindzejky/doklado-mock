import { handleInvoiceIssue } from '$lib/server/doklado/handlers';
import { resetStore, store } from '$lib/server/state/store';
import * as fontkit from 'fontkit';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { beforeEach, describe, expect, test } from 'vitest';
import { formatItemLine, pdfBytesFor } from './render';
import { woffToSfnt } from './woff';

const require = createRequire(import.meta.url);
const API_KEY = 'test-api-key';

const sampleInvoice = {
  organizationId: '12345678',
  type: 'issued_invoice' as const,
  paid: true,
  paymentType: 'card' as const,
  items: [
    {
      name: 'Workshop',
      unitPriceWithoutVat: 100,
      vatRate: 23,
      quantity: 1,
    },
  ],
  customer: {
    name: 'Jane Doe',
    ico: '87654321',
    countryCode: 'sk',
  },
};

beforeEach(() => {
  resetStore();
  store.frozenNow = new Date('2026-08-05T06:29:21.350Z');
});

async function issueAndPdf(data: unknown): Promise<Uint8Array> {
  const response = await handleInvoiceIssue(
    new Request('http://localhost/v1/documents/invoice-issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json', api_key: API_KEY },
      body: JSON.stringify({ data }),
    }),
  );
  const body = await response.json();
  expect(body.success).toBe(true);
  const invoice = store.findInvoice(body.data.documentId);
  expect(invoice).toBeDefined();
  return pdfBytesFor(invoice!);
}

function magic(bytes: Uint8Array): string {
  return Buffer.from(bytes.subarray(0, 4)).toString('ascii');
}

function isSfnt(bytes: Uint8Array): boolean {
  const head = magic(bytes);
  const hex = Buffer.from(bytes.subarray(0, 4)).toString('hex');
  return hex === '00010000' || head === 'OTTO' || head === 'true';
}

async function fontFile2Streams(pdfBytes: Uint8Array): Promise<Uint8Array[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  const files: Uint8Array[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || !obj.has(PDFName.of('FontFile2'))) {
      continue;
    }
    const stream = obj.lookup(PDFName.of('FontFile2'));
    if (!(stream instanceof PDFRawStream)) continue;
    files.push(new Uint8Array(decodePDFRawStream(stream).decode()));
  }
  return files;
}

function hasPoppler(): boolean {
  try {
    execFileSync('pdffonts', ['-v'], { stdio: 'ignore' });
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ppmNonWhitePixels(ppm: Uint8Array): number {
  let offset = 0;
  for (let i = 0; i < 3; i += 1) {
    offset = ppm.indexOf(0x0a, offset) + 1;
  }
  const pixels = ppm.subarray(offset);
  let count = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
      count += 1;
    }
  }
  return count;
}

describe('formatItemLine', () => {
  test('shows quantity and the stored gross line total, not a unit price', () => {
    expect(
      formatItemLine(
        { name: 'Workshop', quantity: 2, price: 246, vatRate: 23 },
        'EUR',
      ),
    ).toBe('Workshop  2  246.00 EUR  DPH 23%');
  });
});

describe('woffToSfnt', () => {
  test('converts fontsource WOFF to TTF that fontkit can open', () => {
    const woff = readFileSync(
      require.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
    );
    expect(magic(woff)).toBe('wOFF');
    const ttf = woffToSfnt(woff);
    expect(isSfnt(ttf)).toBe(true);
    const font = fontkit.create(ttf);
    expect(font.hasGlyphForCodePoint('Ď'.codePointAt(0)!)).toBe(true);
  });
});

describe('invoice PDF fonts', () => {
  test('embeds TTF/OTF, not WOFF, and Poppler can render Slovak text', async () => {
    const bytes = await issueAndPdf({
      ...sampleInvoice,
      note: 'Ďakujeme za včasnú úhradu.',
    });

    const fonts = await fontFile2Streams(bytes);
    expect(fonts.length).toBeGreaterThan(0);
    for (const file of fonts) {
      expect(magic(file)).not.toBe('wOFF');
      expect(isSfnt(file)).toBe(true);
      expect(() => fontkit.create(file)).not.toThrow();
    }

    if (!hasPoppler()) {
      if (process.env.CI) {
        throw new Error('poppler-utils is required in CI to rasterize PDFs');
      }
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'doklado-pdf-'));
    const pdfPath = join(dir, 'invoice.pdf');
    writeFileSync(pdfPath, bytes);
    try {
      const fontsOut = execFileSync('pdffonts', [pdfPath], {
        encoding: 'utf8',
      });
      expect(fontsOut.toLowerCase()).not.toContain('error');

      const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
        encoding: 'utf8',
      });
      expect(text).toContain('Faktúra');
      expect(text).toContain('Ďakujeme za včasnú úhradu.');

      execFileSync('pdftoppm', ['-r', '72', pdfPath, join(dir, 'page')]);
      const ppm = readFileSync(join(dir, 'page-1.ppm'));
      expect(ppmNonWhitePixels(ppm)).toBeGreaterThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('quantity greater than one prints the line total once', async () => {
    const bytes = await issueAndPdf({
      ...sampleInvoice,
      items: [
        {
          name: 'Workshop',
          unitPriceWithoutVat: 100,
          vatRate: 23,
          quantity: 2,
        },
      ],
    });
    const invoice = store.invoices[0];
    expect(invoice.items[0]).toMatchObject({ quantity: 2, price: 246 });
    expect(invoice.totalPrice).toBe(246);

    if (!hasPoppler()) {
      if (process.env.CI) {
        throw new Error('poppler-utils is required in CI to rasterize PDFs');
      }
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'doklado-pdf-qty-'));
    const pdfPath = join(dir, 'invoice.pdf');
    writeFileSync(pdfPath, bytes);
    try {
      const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
        encoding: 'utf8',
      });
      expect(text).toMatch(/Workshop\s+2\s+246\.00 EUR\s+DPH 23%/);
      expect(text).toContain('Spolu: 246.00 EUR');
      expect(text).not.toContain('492.00');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
