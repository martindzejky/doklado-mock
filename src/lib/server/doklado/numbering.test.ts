import { describe, expect, test } from 'vitest';
import {
  formatInvoiceNumber,
  matchesMask,
  parseCounter,
  variableSymbolFromNumber,
} from './numbering';

describe('formatInvoiceNumber', () => {
  test('RRRR is the year and CCC is a zero-padded counter', () => {
    expect(formatInvoiceNumber('#RRRRCCC', 2026, 34)).toBe('2026034');
  });

  test('hash markers are stripped around literals', () => {
    expect(formatInvoiceNumber('#TEST-#RRRRCCC', 2026, 1)).toBe('TEST-2026001');
  });
});

describe('matchesMask', () => {
  test('TEST-8001 fails against TEST-RRRRCCC', () => {
    expect(matchesMask('#TEST-#RRRRCCC', 'TEST-8001')).toBe(false);
  });

  test('TEST-2026001 matches TEST-RRRRCCC', () => {
    expect(matchesMask('#TEST-#RRRRCCC', 'TEST-2026001')).toBe(true);
  });

  test('TEST-0001 does not match RRRRCCC', () => {
    expect(matchesMask('#RRRRCCC', 'TEST-0001')).toBe(false);
  });
});

describe('parseCounter', () => {
  test('reads the padded counter from an explicit number', () => {
    expect(parseCounter('#TEST-#RRRRCCC', 'TEST-2026500')).toBe(500);
  });
});

describe('variableSymbolFromNumber', () => {
  test('TEST-0001 produces 0001', () => {
    expect(variableSymbolFromNumber('TEST-0001')).toBe('0001');
  });
});
