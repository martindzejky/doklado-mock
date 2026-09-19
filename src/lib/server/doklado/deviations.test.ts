import { loadConfig } from '$lib/server/config/load';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { swaggerContradictions } from './contradictions';
import { deviations } from './deviations';
import { ISSUE_KNOWN_KEYS, PDF_KNOWN_KEYS } from './unknown-fields';

type OpenApi = {
  paths: Record<string, unknown>;
  components: {
    schemas: Record<
      string,
      { properties?: Record<string, unknown> } & Record<string, unknown>
    >;
  };
};

const swagger = JSON.parse(
  readFileSync('spec/swagger.json', 'utf8'),
) as OpenApi;

function schemaProperties(name: string): string[] {
  return Object.keys(swagger.components.schemas[name]?.properties ?? {}).sort();
}

function nestedProperties(name: string, field: string): string[] {
  const parent = swagger.components.schemas[name]?.properties?.[field] as
    { properties?: Record<string, unknown> } | undefined;
  return Object.keys(parent?.properties ?? {}).sort();
}

describe('deviations', () => {
  test('records the default-series UI bug instead of faking it', () => {
    expect(deviations.some((item) => item.id === 'default-series-flag')).toBe(
      true,
    );
  });
});

describe('swagger contradictions', () => {
  test('issue response is documentId plus invoiceNumber, not data.document', () => {
    const entry = swaggerContradictions.find(
      (item) => item.id === 'invoice-issue-response',
    );
    expect(entry?.production).toContain('documentId');
    expect(entry?.spec).toContain('data.document');

    const issue200 = JSON.stringify(
      swagger.paths['/v1/documents/invoice-issue'],
    );
    expect(issue200).toContain('"document"');
    expect(issue200).not.toContain('documentId');
    expect(issue200).not.toContain('invoiceNumber');
  });

  test('PDF snapshot still uses a capitalised Content-Type key', () => {
    const entry = swaggerContradictions.find(
      (item) => item.id === 'pdf-content-type-key',
    );
    expect(entry?.production).toContain('Content-Type');
    expect(
      JSON.stringify(swagger.paths['/v1/documents/get-invoice-pdf']),
    ).toContain('"Content-Type"');
  });

  test('organisation-not-found still uses the _CODE suffix in the spec', () => {
    const entry = swaggerContradictions.find(
      (item) => item.id === 'organization-not-found-code',
    );
    expect(entry?.spec).toBe('APP_ORGANIZATION_NOT_FOUND_CODE');
    expect(JSON.stringify(swagger)).toContain(
      'APP_ORGANIZATION_NOT_FOUND_CODE',
    );
  });

  test('APP_DOCUMENT_ALREADY_EXISTS is still absent from the spec', () => {
    const entry = swaggerContradictions.find(
      (item) => item.id === 'document-already-exists',
    );
    expect(entry?.spec).toBe('Not documented');
    expect(JSON.stringify(swagger)).not.toContain(
      'APP_DOCUMENT_ALREADY_EXISTS',
    );
  });
});

describe('vendored issue and PDF schemas', () => {
  test('known issue fields still match InputParametersIssueInvoice', () => {
    expect(schemaProperties('InputParametersIssueInvoice')).toEqual(
      [...ISSUE_KNOWN_KEYS.root].sort(),
    );
    expect(
      nestedProperties('InputParametersIssueInvoice', 'accountingSettings'),
    ).toEqual([...ISSUE_KNOWN_KEYS.accountingSettings].sort());
    expect(nestedProperties('InputParametersIssueInvoice', 'customer')).toEqual(
      [...ISSUE_KNOWN_KEYS.customer].sort(),
    );
    expect(
      nestedProperties('InputParametersIssueInvoice', 'paymentInfo'),
    ).toEqual([...ISSUE_KNOWN_KEYS.paymentInfo].sort());
    expect(schemaProperties('PublicIssueInvoiceItem')).toEqual(
      [...ISSUE_KNOWN_KEYS.item].sort(),
    );
  });

  test('known PDF fields still match InputParametersGetInvoicePdf', () => {
    expect(schemaProperties('InputParametersGetInvoicePdf')).toEqual(
      [...PDF_KNOWN_KEYS].sort(),
    );
  });
});

describe('example config', () => {
  test('loads and has a default series', () => {
    const config = loadConfig();
    expect(config.apiKeys).toContain('test-api-key');
    const org = config.organisations[0];
    expect(org.series.some((series) => series.default)).toBe(true);
  });
});
