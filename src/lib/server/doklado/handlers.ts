import { pdfBytesFor } from '$lib/server/pdf/render';
import { store } from '$lib/server/state/store';
import { jsonResponse, success } from './envelope';
import { APP_INCORRECT_INPUT_DATA, bareError, schemaError } from './errors';
import { withCatchAll, withDoklado } from './http';
import { issueInvoice } from './issue';
import { issueInvoiceDataSchema, pdfDataSchema, treeify } from './schemas';
import { unknownIssueFields, unknownPdfFields } from './unknown-fields';

export function handleInvoiceIssue(request: Request): Promise<Response> {
  return withDoklado(request, (data) => {
    const unknownFields = unknownIssueFields(data);
    const parsed = issueInvoiceDataSchema.safeParse(data);
    if (!parsed.success) {
      return { response: schemaError(treeify(parsed.error)), unknownFields };
    }
    return { response: issueInvoice(parsed.data), unknownFields };
  });
}

export function handleGetInvoicePdf(request: Request): Promise<Response> {
  return withDoklado(request, async (data) => {
    const unknownFields = unknownPdfFields(data);
    const parsed = pdfDataSchema.safeParse(data);
    if (!parsed.success) {
      return { response: schemaError(treeify(parsed.error)), unknownFields };
    }
    const invoice = store.findInvoice(parsed.data.documentId);
    if (!invoice || invoice.tenantId !== parsed.data.organizationId) {
      return { response: bareError(APP_INCORRECT_INPUT_DATA), unknownFields };
    }
    const bytes = await pdfBytesFor(invoice);
    return {
      response: jsonResponse(
        success({
          'Content-Type': 'application/pdf',
          encoding: 'base64',
          data: Buffer.from(bytes).toString('base64'),
        }),
      ),
      unknownFields,
    };
  });
}

export function handleCatchAll(request: Request): Promise<Response> {
  return withCatchAll(request);
}
