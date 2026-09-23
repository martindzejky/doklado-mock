import { z } from 'zod';
import { COUNTRY_CODES } from './country-codes';

export const ISSUE_TYPES = [
  'issued_invoice',
  'issued_credit',
  'issued_debit',
  'issued_advance',
  'issued_tax_document',
] as const;

export const PAYMENT_TYPES = [
  'cash',
  'card',
  'transfer',
  'cash_on_delivery',
] as const;

const itemSchema = z.object({
  name: z.string(),
  unitPriceWithoutVat: z.number(),
  quantity: z.number(),
  vatRate: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  debitAccountingAccountId: z.string().nullable().optional(),
  skuCode: z.string().nullable().optional(),
  ossServiceType: z.unknown().optional(),
  discount: z.unknown().optional(),
});

const customerSchema = z.object({
  ico: z.string().nullable().optional(),
  icDph: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  dic: z.string().nullable().optional(),
  vatPayer: z.boolean().nullable().optional(),
  streetName: z.string().nullable().optional(),
  propertyRegistrationNumber: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  buildingNumber: z.string().nullable().optional(),
  municipality: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  nonCorporateEntity: z.boolean().nullable().optional(),
  registerNumberText: z.string().nullable().optional(),
  vatRegistrationType: z.string().nullable().optional(),
  // BEHAVIOUR.md customer.countryCode: lowercase enum or the literal "other".
  countryCode: z
    .union([z.enum(COUNTRY_CODES), z.literal('other')])
    .nullable()
    .optional(),
  deliveryAddress: z.unknown().optional(),
});

const paymentInfoSchema = z.object({
  iban: z.string().nullable().optional(),
  variableSymbol: z.string().nullable().optional(),
});

const accountingSettingsSchema = z.object({
  numericCodeId: z.string().nullable().optional(),
  expenditureCenterId: z.string().nullable().optional(),
  accountingItemId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  activityId: z.string().nullable().optional(),
  approvalProcessId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  classificationVatId: z.string().nullable().optional(),
  classificationKvVatId: z.string().nullable().optional(),
  debitAccountingAccountId: z.string().nullable().optional(),
  accountingSoftwareAgendaId: z.string().nullable().optional(),
});

export const issueInvoiceDataSchema = z
  .object({
    organizationId: z.string(),
    type: z.enum(ISSUE_TYPES),
    items: z.array(itemSchema),
    customer: customerSchema,
    issueDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    deliveryDate: z.string().nullable().optional(),
    taxPointDate: z.string().nullable().optional(),
    number: z.string().nullable().optional(),
    originalNumber: z.string().nullable().optional(),
    telephoneNumber: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    reverseCharge: z.boolean().nullable().optional(),
    accountingSettings: accountingSettingsSchema.optional(),
    paymentInfo: paymentInfoSchema.optional(),
    note: z.string().nullable().optional(),
    noteAboveItems: z.string().nullable().optional(),
    language: z.enum(['english', 'slovak']).nullable().optional(),
    currency: z.string().nullable().optional(),
    paid: z.boolean().nullable().optional(),
    ossSettings: z.unknown().optional(),
    paymentType: z.enum(PAYMENT_TYPES).nullable().optional(),
    discount: z.unknown().optional(),
    internalNote: z.string().nullable().optional(),
    servesAsDeliveryNote: z.boolean().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // BEHAVIOUR.md Issuing an invoice: transfer requires IBAN; card does not.
    if (data.paymentType === 'transfer' && !data.paymentInfo?.iban) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid input: expected iban, received undefined',
      });
    }
  });

export type IssueInvoiceData = z.infer<typeof issueInvoiceDataSchema>;

export const pdfDataSchema = z.object({
  organizationId: z.string(),
  documentId: z.string(),
});

export type PdfData = z.infer<typeof pdfDataSchema>;

export function treeify(error: z.ZodError): unknown {
  return z.treeifyError(error);
}
