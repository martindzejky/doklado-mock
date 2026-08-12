/**
 * Intentional differences from production. Each entry points at the
 * BEHAVIOUR.md section that records the real behaviour.
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
