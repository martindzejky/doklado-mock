/** BEHAVIOUR.md Numbering series, Targeting a series with numericCodeId. */

export function stripMaskMarkers(mask: string): string {
  return mask.replaceAll('#', '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskPattern(mask: string): { regex: RegExp; counterLength: number } {
  const template = stripMaskMarkers(mask);
  const counter = /C+/.exec(template);
  const counterLength = counter ? counter[0].length : 0;
  const source = escapeRegExp(template)
    .replace('RRRR', '\\d{4}')
    .replace(/C+/, counterLength ? `(\\d{${counterLength}})` : '');
  return { regex: new RegExp(`^${source}$`), counterLength };
}

export function formatInvoiceNumber(
  mask: string,
  year: number,
  counter: number,
): string {
  const template = stripMaskMarkers(mask);
  const withYear = template.replace('RRRR', String(year));
  return withYear.replace(/C+/, (token) =>
    String(counter).padStart(token.length, '0'),
  );
}

export function matchesMask(mask: string, invoiceNumber: string): boolean {
  return maskPattern(mask).regex.test(invoiceNumber);
}

export function parseCounter(
  mask: string,
  invoiceNumber: string,
): number | null {
  const { regex } = maskPattern(mask);
  const match = regex.exec(invoiceNumber);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

/** Digits of the invoice number. BEHAVIOUR.md Issuing an invoice: TEST-0001 → 0001. */
export function variableSymbolFromNumber(invoiceNumber: string): string {
  return invoiceNumber.replaceAll(/\D/g, '');
}
