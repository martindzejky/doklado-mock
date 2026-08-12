import {
  store,
  type PaymentInfo,
  type StoredInvoice,
} from '$lib/server/state/store';
import { resolveDate, utcYear } from './dates';
import { jsonResponse, success } from './envelope';
import {
  alreadyExists,
  APP_ORGANIZATION_NOT_FOUND,
  bareError,
  messageError,
} from './errors';
import { firestoreId } from './ids';
import { convertToHome, priceItems } from './money';
import {
  formatInvoiceNumber,
  matchesMask,
  parseCounter,
  variableSymbolFromNumber,
} from './numbering';
import type { IssueInvoiceData } from './schemas';
import { exposedSubType } from './subtype';

export function issueInvoice(data: IssueInvoiceData): Response {
  const org = store.findOrg(data.organizationId);
  if (!org) return bareError(APP_ORGANIZATION_NOT_FOUND);

  let series = store.defaultSeries(org);
  const numericCodeId = data.accountingSettings?.numericCodeId ?? undefined;
  if (numericCodeId) {
    const found = store.seriesByAbbreviation(org, numericCodeId);
    if (!found) return messageError('Incorrect numeric code');
    series = found;
  }

  const now = store.now();
  const year = utcYear(now);
  const explicitNumber = data.number ?? undefined;
  const invoiceNumber = explicitNumber
    ? explicitNumber
    : formatInvoiceNumber(series.mask, year, series.nextCounter);

  // BEHAVIOUR.md The mask is validated, but only sometimes.
  if (
    numericCodeId &&
    explicitNumber &&
    !matchesMask(series.mask, invoiceNumber)
  ) {
    return messageError('Invoice number doesnt match numeric code format');
  }

  const existing = store.findInvoiceByNumber(org.id, invoiceNumber);
  if (existing) {
    return alreadyExists({
      documentId: existing.documentId,
      subType: existing.subType,
      invoiceNumber: existing.invoiceNumber,
      supplierName: existing.supplierName,
      customerName: existing.organizationName,
    });
  }

  if (explicitNumber) {
    const parsed = parseCounter(series.mask, invoiceNumber);
    if (parsed !== null) {
      series.nextCounter = parsed + 1;
    }
  } else {
    series.nextCounter += 1;
  }

  const priced = priceItems(data.items);
  const currency = data.currency || org.homeCurrency;
  const converted = convertToHome(
    priced.totalPrice,
    currency,
    org.homeCurrency,
    store.config.exchangeRates,
  );
  const subType = exposedSubType(
    org.country,
    data.customer.countryCode,
    data.customer.country,
  );
  const vs =
    data.paymentInfo?.variableSymbol || variableSymbolFromNumber(invoiceNumber);
  const paymentType = data.paymentType ?? '';
  const paymentInfo: PaymentInfo =
    paymentType === 'card'
      ? { bic: org.bank.bic, vs }
      : {
          iban: data.paymentInfo?.iban ?? '',
          bic: org.bank.bic,
          vs,
        };

  const note = data.note ?? '';
  const invoice: StoredInvoice = {
    documentId: firestoreId(() => store.random()),
    tenantId: org.id,
    supplierName: org.name,
    type: 'invoice',
    subType,
    // BEHAVIOUR.md organizationId means two different things
    organizationId: data.customer.ico ?? '',
    organizationName: data.customer.name ?? '',
    organizationTaxId: data.customer.dic ?? '',
    organizationVatId: data.customer.icDph ?? '',
    address: {
      streetName: data.customer.streetName ?? '',
      propertyRegistrationNumber:
        data.customer.propertyRegistrationNumber ?? '',
      buildingNumber: data.customer.buildingNumber ?? '',
      postalCode: data.customer.postalCode ?? '',
      municipality: data.customer.municipality ?? '',
      country: data.customer.country ?? '',
    },
    email: org.email,
    invoiceNumber,
    originalNumber: data.originalNumber ?? '',
    issuedAt: resolveDate(data.issueDate, now),
    dueDate: resolveDate(data.dueDate, now),
    deliveryDate: resolveDate(data.deliveryDate, now),
    // BEHAVIOUR.md Dates: taxPointDate has no request field that sets it.
    taxPointDate: resolveDate(undefined, now),
    createdAt: now.toISOString(),
    currency,
    totalPrice: priced.totalPrice,
    otherCurrency: converted.otherCurrency,
    otherTotalPrice: converted.otherTotalPrice,
    exchangeRate: converted.exchangeRate,
    items: priced.items,
    vatSummary: priced.vatSummary,
    note,
    customText: note,
    internalNote: data.internalNote ?? '',
    paymentType,
    paymentInfo,
    paymentStatus: data.paid ? 'paid' : 'unpaid',
    accountingSettings: {
      numericCode: {
        name: series.name,
        value: series.exportAbbreviation,
      },
    },
    language: data.language ?? 'slovak',
    pdfBytes: null,
  };

  store.addInvoice(invoice);
  return jsonResponse(
    success({ documentId: invoice.documentId, invoiceNumber }),
  );
}
