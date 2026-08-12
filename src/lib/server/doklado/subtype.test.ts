import { describe, expect, test } from 'vitest';
import { exposedSubType } from './subtype';

describe('exposedSubType', () => {
  test('Czech customer is foreign even when billed in EUR', () => {
    expect(exposedSubType('SK', 'cz', undefined)).toBe('foreign_exposed');
  });

  test('Slovak customer is domestic even when billed in CZK', () => {
    expect(exposedSubType('SK', 'sk', undefined)).toBe('domestic_exposed');
  });
});
