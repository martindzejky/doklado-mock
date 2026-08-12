import { describe, expect, test } from 'vitest';
import { convertToHome, priceItems, roundHalfUp } from './money';

describe('roundHalfUp', () => {
  test('rounds 19.074 style totals to two decimals', () => {
    expect(roundHalfUp(19.07)).toBe(19.07);
    expect(roundHalfUp(3.56592)).toBe(3.57);
    expect(roundHalfUp(15.519)).toBe(15.52);
  });
});

describe('priceItems', () => {
  // BEHAVIOUR.md Item `price` is a gross line total.
  test('worked example unitPriceWithoutVat 10.336 vat 23 qty 1.5', () => {
    const result = priceItems([
      {
        name: 'line',
        unitPriceWithoutVat: 10.336,
        vatRate: 23,
        quantity: 1.5,
      },
    ]);
    expect(result.items[0]).toMatchObject({
      price: 19.07,
      vatAmount: 3.57,
      quantity: 1.5,
      vatRate: 23,
    });
    expect(result.totalPrice).toBe(19.07);
  });

  test('vatSummary uses unrounded net sums', () => {
    const result = priceItems([
      {
        name: 'a',
        unitPriceWithoutVat: 10.336,
        vatRate: 23,
        quantity: 1.5,
      },
      {
        name: 'b',
        unitPriceWithoutVat: 0.015,
        vatRate: 23,
        quantity: 1,
      },
    ]);
    expect(result.vatSummary).toEqual([
      {
        vatRate: 23,
        taxBase: 15.52,
        vatAmount: 3.57,
        isTaxExempt: false,
      },
    ]);
  });

  test('zero rate still isTaxExempt false', () => {
    const result = priceItems([
      { name: 'free', unitPriceWithoutVat: 10, vatRate: 0, quantity: 1 },
    ]);
    expect(result.vatSummary[0]).toMatchObject({
      vatRate: 0,
      isTaxExempt: false,
    });
  });
});

describe('convertToHome', () => {
  // BEHAVIOUR.md Currency: 1 CZK in a EUR org, rate 24.2, otherTotalPrice 0.04.
  test('divides by the rate and rounds to two decimals', () => {
    const converted = convertToHome(1, 'CZK', 'EUR', { EUR: 1, CZK: 24.2 });
    expect(converted.exchangeRate).toBe(24.2);
    expect(converted.otherCurrency).toBe('EUR');
    expect(converted.otherTotalPrice).toBe(0.04);
  });

  test('home currency uses rate 1', () => {
    const converted = convertToHome(19.07, 'EUR', 'EUR', { EUR: 1, CZK: 24.2 });
    expect(converted.exchangeRate).toBe(1);
    expect(converted.otherTotalPrice).toBe(19.07);
  });
});
