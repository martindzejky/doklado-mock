/** BEHAVIOUR.md Item `price` is a gross line total. */

export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // Shift via a decimal string so 1.005 and 10.075 hit the half-up boundary
  // instead of a binary float just below it.
  const shifted = Number(`${abs}e${decimals}`);
  const integer = Math.floor(shifted);
  const fraction = shifted - integer;
  const rounded = fraction >= 0.5 ? integer + 1 : integer;
  return sign * Number(`${rounded}e-${decimals}`);
}

export type IssueItemInput = {
  name: string;
  unitPriceWithoutVat: number;
  quantity: number;
  vatRate?: number | null;
  unit?: string | null;
  note?: string | null;
};

export type StoredItem = {
  name: string;
  price: number;
  quantity: number;
  vatRate: number;
  vatAmount: number;
  unit: string;
  note: string;
};

export type VatSummaryEntry = {
  taxBase: number;
  vatAmount: number;
  vatRate: number;
  isTaxExempt: boolean;
};

type OpenItem = {
  stored: StoredItem;
  net: number;
  vat: number;
};

export function priceItems(items: IssueItemInput[]): {
  items: StoredItem[];
  vatSummary: VatSummaryEntry[];
  totalPrice: number;
} {
  const open: OpenItem[] = items.map((item) => {
    const vatRate = item.vatRate ?? 0;
    const net = item.unitPriceWithoutVat * item.quantity;
    const vat = net * (vatRate / 100);
    return {
      net,
      vat,
      stored: {
        name: item.name,
        quantity: item.quantity,
        vatRate,
        price: roundHalfUp(net + vat),
        vatAmount: roundHalfUp(vat),
        unit: item.unit ?? '',
        note: item.note ?? '',
      },
    };
  });

  const byRate = new Map<number, { net: number; vat: number }>();
  for (const item of open) {
    const current = byRate.get(item.stored.vatRate) ?? { net: 0, vat: 0 };
    current.net += item.net;
    current.vat += item.vat;
    byRate.set(item.stored.vatRate, current);
  }

  const vatSummary: VatSummaryEntry[] = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([vatRate, sums]) => ({
      vatRate,
      taxBase: roundHalfUp(sums.net),
      vatAmount: roundHalfUp(sums.vat),
      // BEHAVIOUR.md Item `price` is a gross line total: 0% still isTaxExempt false.
      isTaxExempt: false,
    }));

  const totalPrice = open.reduce((sum, item) => sum + item.stored.price, 0);

  return {
    items: open.map((item) => item.stored),
    vatSummary,
    totalPrice: roundHalfUp(totalPrice),
  };
}

export function convertToHome(
  totalPrice: number,
  currency: string,
  homeCurrency: string,
  rates: Record<string, number>,
): { exchangeRate: number; otherCurrency: string; otherTotalPrice: number } {
  const from = rates[currency];
  const to = rates[homeCurrency];
  if (from === undefined || to === undefined) {
    return {
      exchangeRate: 1,
      otherCurrency: homeCurrency,
      otherTotalPrice: totalPrice,
    };
  }
  const exchangeRate = from / to;
  return {
    exchangeRate,
    otherCurrency: homeCurrency,
    otherTotalPrice: roundHalfUp(totalPrice / exchangeRate),
  };
}
