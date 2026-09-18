import type { StoredInvoice } from '$lib/server/state/store';
import * as fontkit from 'fontkit';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const require = createRequire(import.meta.url);

const LATIN_BYTES = readFileSync(
  require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
);
const LATIN_EXT_BYTES = readFileSync(
  require.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
);

const LATIN_RAW = fontkit.create(LATIN_BYTES);
const LATIN_EXT_RAW = fontkit.create(LATIN_EXT_BYTES);

type Face = { pdf: PDFFont; raw: typeof LATIN_RAW };

function faceFor(ch: string, faces: Face[]): Face {
  const code = ch.codePointAt(0);
  if (code === undefined) return faces[0];
  return faces.find((face) => face.raw.hasGlyphForCodePoint(code)) ?? faces[0];
}

function drawMixed(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; faces: Face[] },
): void {
  let x = opts.x;
  let run = '';
  let runFace = faceFor(text[0] ?? ' ', opts.faces);
  const flush = () => {
    if (!run) return;
    page.drawText(run, {
      x,
      y: opts.y,
      size: opts.size,
      font: runFace.pdf,
      color: rgb(0.06, 0.09, 0.16),
    });
    x += runFace.pdf.widthOfTextAtSize(run, opts.size);
    run = '';
  };
  for (const ch of text) {
    const face = faceFor(ch, opts.faces);
    if (face !== runFace) {
      flush();
      runFace = face;
    }
    run += ch;
  }
  flush();
}

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

export async function renderInvoicePdf(
  invoice: StoredInvoice,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as never);
  const latin = await pdf.embedFont(LATIN_BYTES, { subset: false });
  const latinExt = await pdf.embedFont(LATIN_EXT_BYTES, { subset: false });
  const faces: Face[] = [
    { pdf: latin, raw: LATIN_RAW },
    { pdf: latinExt, raw: LATIN_EXT_RAW },
  ];

  const page = pdf.addPage([595.28, 841.89]);
  const slovak = invoice.language !== 'english';
  let y = 800;

  const line = (text: string, size = 11) => {
    drawMixed(page, text, { x: 50, y, size, faces });
    y -= size + 6;
  };

  line(slovak ? 'Faktúra' : 'Invoice', 22);
  line(`${slovak ? 'Číslo' : 'Number'}: ${invoice.invoiceNumber}`, 12);
  line(`${slovak ? 'Vystavená' : 'Issued'}: ${invoice.issuedAt}`);
  line(`${slovak ? 'Splatnosť' : 'Due'}: ${invoice.dueDate}`);
  y -= 8;
  line(`${slovak ? 'Dodávateľ' : 'Supplier'}: ${invoice.supplierName}`);
  line(`${slovak ? 'Odberateľ' : 'Customer'}: ${invoice.organizationName}`);
  if (invoice.organizationId) line(`IČO: ${invoice.organizationId}`);
  y -= 8;

  for (const item of invoice.items) {
    line(
      `${item.name}  ${item.quantity} × ${money(item.price, invoice.currency)}  DPH ${item.vatRate}%`,
    );
  }

  y -= 8;
  line(
    `${slovak ? 'Spolu' : 'Total'}: ${money(invoice.totalPrice, invoice.currency)}`,
    13,
  );
  if (invoice.note) {
    y -= 8;
    line(invoice.note);
  }

  const created = new Date(invoice.createdAt);
  pdf.setTitle(invoice.invoiceNumber);
  pdf.setProducer('doklado-mock');
  pdf.setCreator('doklado-mock');
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);

  return pdf.save({ updateFieldAppearances: false });
}

export async function pdfBytesFor(invoice: StoredInvoice): Promise<Uint8Array> {
  if (invoice.pdfBytes) return invoice.pdfBytes;
  const bytes = await renderInvoicePdf(invoice);
  invoice.pdfBytes = bytes;
  return bytes;
}
