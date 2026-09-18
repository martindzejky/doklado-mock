/** BEHAVIOUR.md Type and subtype: customer country, not currency. */

export type ExposedSubType = 'domestic_exposed' | 'foreign_exposed';

export function exposedSubType(
  organisationCountry: string,
  customerCountryCode: string | undefined | null,
  customerCountry: string | undefined | null,
): ExposedSubType {
  const org = organisationCountry.trim().toLowerCase();
  const code = customerCountryCode?.trim().toLowerCase();
  if (code) {
    return code === org ? 'domestic_exposed' : 'foreign_exposed';
  }
  const country = customerCountry?.trim().toLowerCase();
  if (!country) return 'domestic_exposed';
  if (country === org) return 'domestic_exposed';
  return 'foreign_exposed';
}
