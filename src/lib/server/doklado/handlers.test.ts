import { resetStore, store } from '$lib/server/state/store';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  handleCatchAll,
  handleGetInvoicePdf,
  handleInvoiceIssue,
} from './handlers';

const API_KEY = 'test-api-key';

function issueRequest(
  body: unknown,
  headers: Record<string, string> = { api_key: API_KEY },
): Request {
  return new Request('http://localhost/v1/documents/invoice-issue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const consumerInvoice = {
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
    contactEmail: 'jane@example.com',
  },
};

beforeEach(() => {
  resetStore();
  store.frozenNow = new Date('2026-08-05T06:29:21.350Z');
});

describe('auth', () => {
  test('missing api_key is 403', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({ data: consumerInvoice }, {}),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Unauthorized!' });
  });

  test('wrong api_key is 401', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({ data: consumerInvoice }, { api_key: 'nope' }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'You are not authorized to make this request',
    });
  });
});

describe('envelope', () => {
  test('malformed JSON is HTTP 400 HTML', async () => {
    const response = await handleInvoiceIssue(issueRequest('{'));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('SyntaxError');
  });

  test('empty body is bare APP_INCORRECT_INPUT_DATA', async () => {
    const response = await handleInvoiceIssue(
      new Request('http://localhost/v1/documents/invoice-issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json', api_key: API_KEY },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
    });
  });

  test('missing data wrapper is bare APP_INCORRECT_INPUT_DATA', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({ organizationId: '12345678' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
    });
  });
});

describe('required fields', () => {
  test.each(['organizationId', 'type', 'items', 'customer'] as const)(
    'missing %s is a Zod tree',
    async (field) => {
      const data = { ...consumerInvoice };
      delete data[field];
      const response = await handleInvoiceIssue(issueRequest({ data }));
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('APP_INCORRECT_INPUT_DATA');
      expect(body.data.properties[field].errors.length).toBeGreaterThan(0);
    },
  );
});

describe('happy path', () => {
  test('returns documentId and invoiceNumber from the default series', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({ data: consumerInvoice }),
    );
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: { invoiceNumber: '2026001' },
    });
    expect(body.data.documentId).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  test('paid card consumer path stores payment and issuer email', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({ data: consumerInvoice }),
    );
    const { data } = await response.json();
    const invoice = store.findInvoice(data.documentId);
    expect(invoice?.paymentStatus).toBe('paid');
    expect(invoice?.paymentType).toBe('card');
    expect(invoice?.paymentInfo).toEqual({
      bic: 'GIBASKBX',
      vs: '2026001',
    });
    expect(invoice?.email).toBe('invoices@example.sk');
    expect(invoice?.organizationId).toBe('87654321');
    expect(invoice?.organizationName).toBe('Jane Doe');
    expect(invoice?.subType).toBe('domestic_exposed');
    expect(invoice?.note).toBe('');
    expect(invoice?.customText).toBe('');
  });

  test('unknown fields are ignored and logged as warnings', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({
        data: { ...consumerInvoice, totallyUnknown: true },
      }),
    );
    expect((await response.json()).success).toBe(true);
    expect(store.requests[0].unknownFields).toContain('totallyUnknown');
  });
});

describe('numbering', () => {
  test('duplicate number returns APP_DOCUMENT_ALREADY_EXISTS', async () => {
    const data = { ...consumerInvoice, number: 'TEST-0001' };
    const first = await handleInvoiceIssue(issueRequest({ data }));
    expect((await first.json()).success).toBe(true);
    const second = await handleInvoiceIssue(issueRequest({ data }));
    const body = await second.json();
    expect(body.code).toBe('APP_DOCUMENT_ALREADY_EXISTS');
    expect(body.data.invoiceNumber).toBe('TEST-0001');
    expect(body.data.expenseId).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  test('numericCodeId validates the mask', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          number: 'TEST-8001',
          accountingSettings: { numericCodeId: 'TESTRADEXPORT' },
        },
      }),
    );
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
      message: 'Invoice number doesnt match numeric code format',
    });
  });

  test('numericCodeId issues from the named series and moves the counter', async () => {
    const first = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          accountingSettings: { numericCodeId: 'TESTRADEXPORT' },
        },
      }),
    );
    expect((await first.json()).data.invoiceNumber).toBe('TEST-2026001');

    const explicit = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          number: 'TEST-2026500',
          accountingSettings: { numericCodeId: 'TESTRADEXPORT' },
        },
      }),
    );
    expect((await explicit.json()).data.invoiceNumber).toBe('TEST-2026500');

    const next = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          accountingSettings: { numericCodeId: 'TESTRADEXPORT' },
        },
      }),
    );
    expect((await next.json()).data.invoiceNumber).toBe('TEST-2026501');
  });

  test('unknown numericCodeId is a business-rule error', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          accountingSettings: { numericCodeId: 'not-a-series' },
        },
      }),
    );
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
      message: 'Incorrect numeric code',
    });
  });

  test('unknown organisation is APP_ORGANIZATION_NOT_FOUND', async () => {
    const response = await handleInvoiceIssue(
      issueRequest({
        data: { ...consumerInvoice, organizationId: '00000000' },
      }),
    );
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_ORGANIZATION_NOT_FOUND',
    });
  });
});

describe('catch-alls', () => {
  test('unknown v1 path is logged and returns Doklado 403', async () => {
    const response = await handleCatchAll(
      new Request('http://localhost/v1/documents/typo', {
        method: 'POST',
        headers: { api_key: API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ data: {} }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Unauthorized!' });
    expect(store.requests[0].path).toBe('/v1/documents/typo');
  });

  test('unknown v2 path is logged and returns Doklado 403', async () => {
    const response = await handleCatchAll(
      new Request('http://localhost/v2/documents', {
        method: 'POST',
        headers: { api_key: API_KEY },
      }),
    );
    expect(response.status).toBe(403);
    expect(store.requests[0].path).toBe('/v2/documents');
  });
});

function pdfRequest(data: unknown): Request {
  return new Request('http://localhost/v1/documents/get-invoice-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json', api_key: API_KEY },
    body: JSON.stringify({ data }),
  });
}

describe('get-invoice-pdf', () => {
  test('returns a capitalised Content-Type envelope', async () => {
    const issued = await handleInvoiceIssue(
      issueRequest({
        data: {
          ...consumerInvoice,
          note: 'Ďakujeme za účasť, Ľuboš',
        },
      }),
    );
    const { data } = await issued.json();
    const response = await handleGetInvoicePdf(
      pdfRequest({ organizationId: '12345678', documentId: data.documentId }),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data['Content-Type']).toBe('application/pdf');
    expect(body.data.encoding).toBe('base64');
    const bytes = Buffer.from(body.data.data, 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test('same documentId returns byte-identical PDF bytes', async () => {
    const issued = await handleInvoiceIssue(
      issueRequest({ data: consumerInvoice }),
    );
    const { data } = await issued.json();
    const payload = {
      organizationId: '12345678',
      documentId: data.documentId,
    };
    const first = await handleGetInvoicePdf(pdfRequest(payload));
    const second = await handleGetInvoicePdf(pdfRequest(payload));
    const a = (await first.json()).data.data;
    const b = (await second.json()).data.data;
    expect(a).toBe(b);
  });
});
