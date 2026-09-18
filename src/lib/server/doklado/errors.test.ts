import { describe, expect, test } from 'vitest';
import {
  alreadyExists,
  APP_DOCUMENT_ALREADY_EXISTS,
  APP_INCORRECT_INPUT_DATA,
  APP_ORGANIZATION_NOT_FOUND,
  bareError,
  malformedJson,
  messageError,
  missingApiKey,
  schemaError,
  wrongApiKey,
} from './errors';

async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe('auth errors', () => {
  test('missing api_key is HTTP 403 Unauthorized!', async () => {
    const response = missingApiKey();
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ error: 'Unauthorized!' });
  });

  test('wrong api_key is HTTP 401 without the envelope', async () => {
    const response = wrongApiKey();
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({
      error: 'You are not authorized to make this request',
    });
  });
});

describe('application errors', () => {
  test('bare form', async () => {
    const response = bareError(APP_ORGANIZATION_NOT_FOUND);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      success: false,
      code: APP_ORGANIZATION_NOT_FOUND,
    });
  });

  test('schema form keeps the Zod tree', async () => {
    const response = schemaError({
      errors: [],
      properties: {
        organizationId: {
          errors: ['Invalid input: expected string, received undefined'],
        },
      },
    });
    expect(await body(response)).toEqual({
      success: false,
      code: APP_INCORRECT_INPUT_DATA,
      data: {
        errors: [],
        properties: {
          organizationId: {
            errors: ['Invalid input: expected string, received undefined'],
          },
        },
      },
    });
  });

  test('business-rule form uses message', async () => {
    const response = messageError(
      'Invoice number doesnt match numeric code format',
    );
    expect(await body(response)).toEqual({
      success: false,
      code: APP_INCORRECT_INPUT_DATA,
      message: 'Invoice number doesnt match numeric code format',
    });
  });

  test('conflict form uses expenseId for an issued invoice', async () => {
    const response = alreadyExists({
      documentId: 'abc',
      subType: 'domestic_exposed',
      invoiceNumber: 'TEST-2026001',
      supplierName: 'Example s.r.o.',
      customerName: 'Customer',
    });
    expect(await body(response)).toEqual({
      success: false,
      code: APP_DOCUMENT_ALREADY_EXISTS,
      data: {
        expenseId: 'abc',
        invoiceType: 'domestic_exposed',
        invoiceNumber: 'TEST-2026001',
        supplierName: 'Example s.r.o.',
        customerName: 'Customer',
      },
    });
  });
});

describe('malformed JSON', () => {
  test('returns HTTP 400 Express HTML', async () => {
    const response = malformedJson(new SyntaxError('Unexpected token'));
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('text/html');
    const text = await response.text();
    expect(text).toContain('<pre>SyntaxError:');
    expect(text).not.toContain('{');
  });
});
