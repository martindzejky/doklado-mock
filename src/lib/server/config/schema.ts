import { z } from 'zod';

const bankSchema = z.object({
  iban: z.string(),
  bic: z.string(),
});

const seriesSchema = z.object({
  name: z.string(),
  mask: z.string(),
  exportAbbreviation: z.string(),
  counter: z.number().int().positive(),
  default: z.boolean(),
});

const organisationSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  homeCurrency: z.string(),
  email: z.string(),
  bank: bankSchema,
  series: z.array(seriesSchema).min(1),
});

export const mockConfigSchema = z.object({
  apiKeys: z.array(z.string()).min(1),
  organisations: z.array(organisationSchema).min(1),
  exchangeRates: z.record(z.string(), z.number().positive()),
});

export type MockConfig = z.infer<typeof mockConfigSchema>;
export type OrganisationConfig = z.infer<typeof organisationSchema>;
export type SeriesConfig = z.infer<typeof seriesSchema>;
