import { issueInvoiceDataSchema } from '$lib/server/doklado/schemas';

export const SEED_INVOICE = issueInvoiceDataSchema.parse({
  organizationId: '12345678',
  type: 'issued_invoice',
  paid: true,
  paymentType: 'card',
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
});
