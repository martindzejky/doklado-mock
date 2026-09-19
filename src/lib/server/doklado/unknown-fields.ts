export const ISSUE_KNOWN_KEYS = {
  root: [
    'organizationId',
    'type',
    'issueDate',
    'dueDate',
    'deliveryDate',
    'taxPointDate',
    'number',
    'originalNumber',
    'telephoneNumber',
    'email',
    'website',
    'reverseCharge',
    'accountingSettings',
    'items',
    'customer',
    'paymentInfo',
    'note',
    'noteAboveItems',
    'language',
    'currency',
    'paid',
    'ossSettings',
    'paymentType',
    'discount',
    'internalNote',
    'servesAsDeliveryNote',
  ],
  accountingSettings: [
    'numericCodeId',
    'expenditureCenterId',
    'accountingItemId',
    'projectId',
    'activityId',
    'approvalProcessId',
    'orderId',
    'classificationVatId',
    'classificationKvVatId',
    'debitAccountingAccountId',
    'accountingSoftwareAgendaId',
  ],
  customer: [
    'ico',
    'icDph',
    'name',
    'dic',
    'vatPayer',
    'streetName',
    'propertyRegistrationNumber',
    'postalCode',
    'buildingNumber',
    'municipality',
    'country',
    'contactEmail',
    'nonCorporateEntity',
    'registerNumberText',
    'vatRegistrationType',
    'countryCode',
    'deliveryAddress',
  ],
  paymentInfo: ['iban', 'variableSymbol'],
  item: [
    'name',
    'unitPriceWithoutVat',
    'vatRate',
    'quantity',
    'unit',
    'note',
    'debitAccountingAccountId',
    'skuCode',
    'ossServiceType',
    'discount',
  ],
} as const;

function extraKeys(
  value: unknown,
  known: readonly string[],
  path: string,
): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const extras: string[] = [];
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      extras.push(path ? `${path}.${key}` : key);
    }
  }
  return extras;
}

/** BEHAVIOUR.md Unknown fields are ignored. */
export function unknownIssueFields(data: unknown): string[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  const record = data as Record<string, unknown>;
  const extras = extraKeys(record, ISSUE_KNOWN_KEYS.root, '');
  extras.push(
    ...extraKeys(
      record.accountingSettings,
      ISSUE_KNOWN_KEYS.accountingSettings,
      'accountingSettings',
    ),
  );
  extras.push(
    ...extraKeys(record.customer, ISSUE_KNOWN_KEYS.customer, 'customer'),
  );
  extras.push(
    ...extraKeys(
      record.paymentInfo,
      ISSUE_KNOWN_KEYS.paymentInfo,
      'paymentInfo',
    ),
  );
  if (Array.isArray(record.items)) {
    record.items.forEach((item, index) => {
      extras.push(...extraKeys(item, ISSUE_KNOWN_KEYS.item, `items.${index}`));
    });
  }
  return extras;
}

export const PDF_KNOWN_KEYS = ['organizationId', 'documentId'] as const;

export function unknownPdfFields(data: unknown): string[] {
  return extraKeys(data, PDF_KNOWN_KEYS, '');
}
