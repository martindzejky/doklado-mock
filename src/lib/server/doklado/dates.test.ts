import { describe, expect, test } from 'vitest';
import { resolveDate, utcYear } from './dates';

describe('resolveDate', () => {
  const now = new Date('2026-08-05T06:29:21.350Z');

  test('date-only input becomes midnight UTC', () => {
    expect(resolveDate('2026-08-05', now)).toBe('2026-08-05T00:00:00.000Z');
  });

  test('omitted values become the creation timestamp', () => {
    expect(resolveDate(undefined, now)).toBe('2026-08-05T06:29:21.350Z');
    expect(resolveDate(null, now)).toBe('2026-08-05T06:29:21.350Z');
  });
});

describe('utcYear', () => {
  test('uses the UTC year of the store clock', () => {
    expect(utcYear(new Date('2026-08-05T06:29:21.350Z'))).toBe(2026);
  });
});
