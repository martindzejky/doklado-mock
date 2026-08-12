import { loadConfig } from '$lib/server/config/load';
import { describe, expect, test } from 'vitest';
import { swaggerContradictions } from './contradictions';
import { deviations } from './deviations';

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
