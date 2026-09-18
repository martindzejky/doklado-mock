/** BEHAVIOUR.md Dates. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function toIso(now: Date): string {
  return now.toISOString();
}

/**
 * Date-only input such as 2026-08-05 returns as 2026-08-05T00:00:00.000Z.
 * Omitted values become the creation timestamp, not midnight.
 */
export function resolveDate(
  value: string | undefined | null,
  now: Date,
): string {
  if (value === undefined || value === null || value === '') {
    return toIso(now);
  }
  if (DATE_ONLY.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return toIso(now);
  }
  return parsed.toISOString();
}

export function utcYear(now: Date): number {
  return now.getUTCFullYear();
}
