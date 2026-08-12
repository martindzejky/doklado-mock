import type { RequestLogEntry, StoredInvoice } from './store';

export function invoiceSummary(invoice: StoredInvoice) {
  return {
    documentId: invoice.documentId,
    invoiceNumber: invoice.invoiceNumber,
    organizationName: invoice.organizationName,
    totalPrice: invoice.totalPrice,
    currency: invoice.currency,
    paymentStatus: invoice.paymentStatus,
    createdAt: invoice.createdAt,
    subType: invoice.subType,
  };
}

export function invoiceDetail(invoice: StoredInvoice) {
  const { pdfBytes, ...rest } = invoice;
  void pdfBytes;
  return rest;
}

export function requestSummary(entry: RequestLogEntry) {
  return {
    id: entry.id,
    at: entry.at,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    code: entry.code,
    durationMs: entry.durationMs,
    unknownFields: entry.unknownFields,
  };
}
