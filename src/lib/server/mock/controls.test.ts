import { handleInvoiceIssue } from '$lib/server/doklado/handlers';
import { resetStore, store } from '$lib/server/state/store';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  handleMockEvents,
  handleMockFault,
  handleMockReset,
  handleMockSeed,
  handleMockState,
} from './controls';

const API_KEY = 'test-api-key';

function issue(body: unknown): Promise<Response> {
  return handleInvoiceIssue(
    new Request('http://localhost/v1/documents/invoice-issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json', api_key: API_KEY },
      body: JSON.stringify({ data: body }),
    }),
  );
}

const invoice = {
  organizationId: '12345678',
  type: 'issued_invoice' as const,
  items: [{ name: 'Item', unitPriceWithoutVat: 10, vatRate: 0, quantity: 1 }],
  customer: { name: 'Pat', countryCode: 'sk' },
};

beforeEach(() => {
  resetStore();
  store.frozenNow = new Date('2026-08-05T06:29:21.350Z');
});

describe('__mock/reset', () => {
  test('clears invoices and restores counters', async () => {
    await issue(invoice);
    expect(store.invoices).toHaveLength(1);
    await handleMockReset();
    expect(store.invoices).toHaveLength(0);
    expect(store.organisations[0].series[0].nextCounter).toBe(1);
  });
});

describe('__mock/seed', () => {
  test('loads invoices and counter overrides', async () => {
    const response = await handleMockSeed(
      new Request('http://localhost/__mock/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          now: '2026-08-05T06:29:21.350Z',
          series: [
            {
              organizationId: '12345678',
              exportAbbreviation: 'FA',
              nextCounter: 9,
            },
          ],
          invoices: [invoice],
        }),
      }),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(store.invoices).toHaveLength(1);
    expect(store.invoices[0].invoiceNumber).toBe('2026009');
  });

  test('malformed JSON is 400', async () => {
    const response = await handleMockSeed(
      new Request('http://localhost/__mock/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid JSON',
    });
  });

  test('failed invoice seed returns the error body and rolls back', async () => {
    const reasons: string[] = [];
    const unsubscribe = store.subscribe((event) => reasons.push(event.reason));
    const response = await handleMockSeed(
      new Request('http://localhost/__mock/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoices: [invoice, { ...invoice, organizationId: '00000000' }],
        }),
      }),
    );
    unsubscribe();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_ORGANIZATION_NOT_FOUND',
    });
    expect(store.invoices).toHaveLength(0);
    expect(store.organisations[0].series[0].nextCounter).toBe(1);
    expect(reasons.at(-1)).toBe('seed');
  });

  test('invalid now is 400 and leaves the clock alone', async () => {
    const response = await handleMockSeed(
      new Request('http://localhost/__mock/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ now: 'not-a-date' }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid now');
    expect(store.frozenNow?.toISOString()).toBe('2026-08-05T06:29:21.350Z');
  });
});

describe('__mock/fault', () => {
  test('malformed JSON is 400', async () => {
    const response = await handleMockFault(
      new Request('http://localhost/__mock/fault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid JSON',
    });
  });

  test('afterSuccess fails the response after creating the invoice', async () => {
    await handleMockFault(
      new Request('http://localhost/__mock/fault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: '/v1/documents/invoice-issue',
          remaining: 1,
          afterSuccess: true,
          code: 'APP_INCORRECT_INPUT_DATA',
        }),
      }),
    );
    const response = await issue(invoice);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
    });
    expect(store.invoices).toHaveLength(1);
    expect(store.invoices[0].invoiceNumber).toBe('2026001');
    expect(store.organisations[0].series[0].nextCounter).toBe(2);

    const retry = await issue(invoice);
    expect((await retry.json()).success).toBe(true);
    expect(store.invoices).toHaveLength(2);
  });

  test('forces an error code for N calls', async () => {
    await handleMockFault(
      new Request('http://localhost/__mock/fault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: '/v1/documents/invoice-issue',
          remaining: 1,
          code: 'APP_INCORRECT_INPUT_DATA',
        }),
      }),
    );
    const first = await issue(invoice);
    expect(await first.json()).toEqual({
      success: false,
      code: 'APP_INCORRECT_INPUT_DATA',
    });
    const second = await issue(invoice);
    expect((await second.json()).success).toBe(true);
  });
});

describe('__mock/events', () => {
  test('an aborted inspector does not fail later invoice issues', async () => {
    const abort = new AbortController();
    const events = handleMockEvents(
      new Request('http://localhost/__mock/events', { signal: abort.signal }),
    );
    const reader = events.body?.getReader();
    abort.abort();
    await reader?.cancel();
    const response = await issue(invoice);
    expect((await response.json()).success).toBe(true);
    expect(store.invoices).toHaveLength(1);
  });
});

describe('store listeners', () => {
  test('a throwing subscriber is dropped and does not fail issue', async () => {
    const unsubscribe = store.subscribe(() => {
      throw new Error('stale inspector');
    });
    const response = await issue(invoice);
    unsubscribe();
    expect((await response.json()).success).toBe(true);
    expect(store.invoices).toHaveLength(1);
  });
});

describe('__mock/state', () => {
  test('returns invoices, counters, and the request log', async () => {
    await issue(invoice);
    const body = await handleMockState().json();
    expect(body.invoices).toHaveLength(1);
    expect(body.counters[0].series[0].nextCounter).toBe(2);
    expect(body.requests[0].path).toBe('/v1/documents/invoice-issue');
  });
});
