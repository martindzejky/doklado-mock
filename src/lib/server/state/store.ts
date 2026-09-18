import { loadConfig } from '$lib/server/config/load';
import type {
  MockConfig,
  OrganisationConfig,
  SeriesConfig,
} from '$lib/server/config/schema';
import type { StoredItem, VatSummaryEntry } from '$lib/server/doklado/money';

export type PaymentInfo = {
  iban?: string;
  bic?: string;
  vs?: string;
  ss?: string;
  ks?: string;
};

export type StoredInvoice = {
  documentId: string;
  tenantId: string;
  supplierName: string;
  type: 'invoice';
  subType: 'domestic_exposed' | 'foreign_exposed';
  organizationId: string;
  organizationName: string;
  organizationTaxId: string;
  organizationVatId: string;
  address: {
    streetName: string;
    propertyRegistrationNumber: string;
    buildingNumber: string;
    postalCode: string;
    municipality: string;
    country: string;
  };
  email: string;
  invoiceNumber: string;
  originalNumber: string;
  issuedAt: string;
  dueDate: string;
  deliveryDate: string;
  taxPointDate: string;
  createdAt: string;
  currency: string;
  totalPrice: number;
  otherCurrency: string;
  otherTotalPrice: number;
  exchangeRate: number;
  items: StoredItem[];
  vatSummary: VatSummaryEntry[];
  note: string;
  customText: string;
  internalNote: string;
  paymentType: string;
  paymentInfo: PaymentInfo;
  paymentStatus: 'paid' | 'not_paid' | 'in_progress' | 'partially_paid' | '';
  accountingSettings: {
    numericCode: {
      name: string;
      value: string;
    };
  };
  language: string;
  pdfBytes: Uint8Array | null;
};

export type RequestLogEntry = {
  id: string;
  at: string;
  method: string;
  path: string;
  status: number;
  code: string;
  durationMs: number;
  requestBody: unknown;
  responseBody: unknown;
  unknownFields: string[];
};

export type Fault = {
  path: string;
  remaining: number | null;
  latencyMs?: number;
  httpStatus?: number;
  code?: string;
  message?: string;
  afterSuccess?: boolean;
};

export type StoreEvent = {
  type: 'change';
  reason: string;
};

export type SeriesState = SeriesConfig & { nextCounter: number };

export type OrgState = Omit<OrganisationConfig, 'series'> & {
  series: SeriesState[];
};

type Listener = (event: StoreEvent) => void;

function cloneConfig(config: MockConfig): OrgState[] {
  return config.organisations.map((org) => ({
    ...org,
    series: org.series.map((series) => ({
      ...series,
      nextCounter: series.counter,
    })),
  }));
}

class MockStore {
  config: MockConfig;
  organisations: OrgState[] = [];
  invoices: StoredInvoice[] = [];
  requests: RequestLogEntry[] = [];
  faults: Fault[] = [];
  frozenNow: Date | null = null;
  random: () => number = Math.random;
  private listeners = new Set<Listener>();
  private seq = 0;

  constructor(config: MockConfig) {
    this.config = config;
    this.organisations = cloneConfig(config);
  }

  now(): Date {
    return this.frozenNow ? new Date(this.frozenNow.getTime()) : new Date();
  }

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  reset(config: MockConfig = this.config): void {
    this.config = config;
    this.organisations = cloneConfig(config);
    this.invoices = [];
    this.requests = [];
    this.faults = [];
    this.frozenNow = null;
    this.random = Math.random;
    this.seq = 0;
    this.emit('reset');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(reason: string): void {
    const event: StoreEvent = { type: 'change', reason };
    for (const listener of this.listeners) listener(event);
  }

  findOrg(id: string): OrgState | undefined {
    return this.organisations.find((org) => org.id === id);
  }

  defaultSeries(org: OrgState): SeriesState {
    // BEHAVIOUR.md Numbering series, and the bug in them.
    // Production ignores the UI default flag. The mock uses the config default.
    return org.series.find((series) => series.default) ?? org.series[0];
  }

  seriesByAbbreviation(
    org: OrgState,
    abbreviation: string,
  ): SeriesState | undefined {
    return org.series.find(
      (series) => series.exportAbbreviation === abbreviation,
    );
  }

  findInvoice(documentId: string): StoredInvoice | undefined {
    return this.invoices.find((invoice) => invoice.documentId === documentId);
  }

  findInvoiceByNumber(
    tenantId: string,
    invoiceNumber: string,
  ): StoredInvoice | undefined {
    return this.invoices.find(
      (invoice) =>
        invoice.tenantId === tenantId &&
        invoice.invoiceNumber === invoiceNumber,
    );
  }

  addInvoice(invoice: StoredInvoice): void {
    this.invoices.push(invoice);
    this.emit('invoice');
  }

  log(entry: Omit<RequestLogEntry, 'id' | 'at'>): RequestLogEntry {
    const full: RequestLogEntry = {
      ...entry,
      id: this.nextId('req'),
      at: this.now().toISOString(),
    };
    this.requests.unshift(full);
    this.emit('request');
    return full;
  }

  consumeFault(path: string): Fault | undefined {
    const index = this.faults.findIndex((fault) => fault.path === path);
    if (index === -1) return undefined;
    const fault = this.faults[index];
    if (fault.remaining === null) return fault;
    if (fault.remaining <= 1) {
      this.faults.splice(index, 1);
    } else {
      this.faults[index] = { ...fault, remaining: fault.remaining - 1 };
    }
    this.emit('fault');
    return fault;
  }

  snapshot() {
    return {
      invoices: this.invoices.map(({ pdfBytes, ...invoice }) => ({
        ...invoice,
        hasPdf: pdfBytes !== null,
      })),
      counters: this.organisations.map((org) => ({
        organizationId: org.id,
        series: org.series.map((series) => ({
          name: series.name,
          exportAbbreviation: series.exportAbbreviation,
          nextCounter: series.nextCounter,
        })),
      })),
      requests: this.requests.slice(0, 50),
      faults: this.faults,
    };
  }
}

export const store = new MockStore(loadConfig());

export function resetStore(config?: MockConfig): void {
  store.reset(config ?? loadConfig());
}
