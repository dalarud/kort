import type { DisplayCurrency, Rates } from "./schemas";

/**
 * Approximate USD-based rates used when live ECB rates cannot be fetched.
 * They only need to be in the right ballpark – values are estimates anyway.
 */
export const FALLBACK_RATES: Rates = {
  base: "USD",
  date: "2026-11-06",
  source: "fallback",
  rates: {
    USD: 1,
    EUR: 0.9,
    GBP: 0.75,
    SEK: 9.9,
    NOK: 9.4,
    DKK: 6.7,
    CAD: 1.41,
    AUD: 1.46,
    CHF: 0.82,
    JPY: 158,
    PLN: 3.93,
  },
};

/** Converts between currencies using USD-based rates. Returns null for unknown currencies. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();
  if (fromCode === toCode) return amount;
  const fromRate = fromCode === "USD" ? 1 : rates.rates[fromCode];
  const toRate = toCode === "USD" ? 1 : rates.rates[toCode];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

export function toUsd(amount: number, from: string, rates: Rates): number | null {
  return convert(amount, from, "USD", rates);
}

export function fromUsd(amount: number, to: DisplayCurrency, rates: Rates): number {
  return convert(amount, "USD", to, rates) ?? amount;
}

/**
 * Rounds a monetary value to a "sensible" precision for display:
 * 0.37 → 0.37, 12.34 → 12, 1234 → 1230, 23456 → 23500.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 10) return Math.round(value * 100) / 100;
  if (value < 1000) return Math.round(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / magnitude) * magnitude;
}

export function formatMoney(value: number, currency: string, locale = "sv-SE"): string {
  const digits = value > 0 && value < 10 ? 2 : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

export function formatRange(low: number, high: number, currency: string, locale = "sv-SE"): string {
  return `${formatMoney(low, currency, locale)} – ${formatMoney(high, currency, locale)}`;
}
