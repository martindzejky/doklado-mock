import { pdfBytesFor } from '$lib/server/pdf/render';
import { store } from '$lib/server/state/store';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const invoice = store.findInvoice(params.id);
  if (!invoice) error(404, 'Invoice not found');
  const bytes = await pdfBytesFor(invoice);
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
};
