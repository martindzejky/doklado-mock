/**
 * Intentional differences between this mock and production.
 *
 * The mock copies observed Doklado behaviour. Entries here are the exceptions:
 * places we deliberately do not fake a production bug because we never isolated
 * the real rule. Each entry points at the BEHAVIOUR.md section that records
 * what production actually does.
 *
 * This file is mock vs production. Spec vs production lives in
 * contradictions.ts. HTTP behaviour is tested in handlers.test.ts, not here.
 * deviations.test.ts only checks that the catalogue still names these
 * exceptions so nobody "fixes" them later.
 */
export const deviations = [
  {
    id: 'default-series-flag',
    behaviour: 'Numbering series, and the bug in them',
    production:
      'The UI default checkbox does not decide which series the API issues from.',
    mock: 'Issues from the series marked default in config. Faking the bug would invent a rule we never isolated.',
  },
] as const;

export type Deviation = (typeof deviations)[number];
