import {
  issueInvoiceDataSchema,
  type IssueInvoiceData,
} from '$lib/server/doklado/schemas';

const SEED_INVOICE_FIELDS = {
  type: 'issued_invoice' as const,
  paid: true,
  paymentType: 'card' as const,
  items: [
    {
      name: 'Workshop',
      unitPriceWithoutVat: 100,
      vatRate: 23,
      quantity: 1,
    },
  ],
  customer: {
    name: 'Jane Doe',
    ico: '87654321',
    countryCode: 'sk',
  },
};

/** First organisation in loaded config. */
export function defaultSeedOrganizationId(
  organisations: { id: string }[],
): string {
  return organisations[0].id;
}

export function defaultSeedInvoice(organizationId: string): IssueInvoiceData {
  return issueInvoiceDataSchema.parse({
    organizationId,
    ...SEED_INVOICE_FIELDS,
  });
}
