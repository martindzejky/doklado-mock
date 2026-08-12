/**
 * Places where spec/swagger.json disagrees with production. Tests assert the
 * mock matches production and that the recorded contradiction still holds.
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
