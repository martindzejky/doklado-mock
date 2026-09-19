/**
 * Places where spec/swagger.json disagrees with observed production.
 *
 * The mock follows production, not the published OpenAPI document. These
 * entries name the spec lies so a snapshot refresh cannot silently treat a
 * spec "fix" as a behaviour change. deviations.test.ts reads the vendored
 * snapshot and fails if the spec starts matching production, or documents a
 * code it currently omits.
 *
 * Recorded lies: issuing returns data.documentId and data.invoiceNumber, not
 * data.document; the PDF key is Content-Type; unknown org is
 * APP_ORGANIZATION_NOT_FOUND, not APP_ORGANIZATION_NOT_FOUND_CODE; duplicate
 * numbers use APP_DOCUMENT_ALREADY_EXISTS, which the spec does not mention.
 *
 * This file is spec vs production. Mock vs production lives in deviations.ts.
 * HTTP behaviour is tested in handlers.test.ts, not here.
 */
export const swaggerContradictions = [
  {
    id: 'invoice-issue-response',
    path: '/v1/documents/invoice-issue',
    behaviour: 'Issuing an invoice',
    spec: 'data.document is a string id',
    production: 'data.documentId and data.invoiceNumber',
  },
  {
    id: 'pdf-content-type-key',
    path: '/v1/documents/get-invoice-pdf',
    behaviour: 'Invoice PDF',
    spec: 'The published snapshot already uses Content-Type; keep asserting the capitalised key so a spec "fix" to content-type would fail loudly',
    production: 'data["Content-Type"] is "application/pdf"',
  },
  {
    id: 'organization-not-found-code',
    path: '/v1/documents/invoice-issue',
    behaviour: 'Errors',
    spec: 'APP_ORGANIZATION_NOT_FOUND_CODE',
    production: 'APP_ORGANIZATION_NOT_FOUND',
  },
  {
    id: 'document-already-exists',
    path: '/v1/documents/invoice-issue',
    behaviour: 'Duplicate numbers',
    spec: 'Not documented',
    production:
      'APP_DOCUMENT_ALREADY_EXISTS with expenseId of the issued invoice',
  },
] as const;
