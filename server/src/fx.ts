import { FALLBACK_RATES, type Rates } from "@kort/shared";

const TTL_MS = 12 * 60 * 60 * 1000;

export interface FxSource {
  getRates(): Promise<Rates>;
}

/**
 * Daily ECB reference rates via the Frankfurter API (no key required), cached for
 * 12 h. Falls back to built-in approximate rates when the service is unreachable.
 */
export class FxService implements FxSource {
  private cache: { rates: Rates; fetchedAt: number } | null = null;
  private inflight: Promise<Rates> | null = null;

  constructor(
    private readonly url: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  async getRates(): Promise<Rates> {
    if (!this.url) return FALLBACK_RATES;
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) return this.cache.rates;
    this.inflight ??= this.fetchRates().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchRates(): Promise<Rates> {
    try {
      const response = await this.fetchImpl(this.url!, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { base?: string; date?: string; rates?: Record<string, number> };
      if (body.base !== "USD" || !body.rates || typeof body.rates !== "object") throw new Error("unexpected body");
      const rates: Rates = {
        base: "USD",
        date: body.date ?? new Date().toISOString().slice(0, 10),
        source: "ecb",
        rates: { ...FALLBACK_RATES.rates, ...body.rates, USD: 1 },
      };
      this.cache = { rates, fetchedAt: Date.now() };
      return rates;
    } catch (error) {
      this.log(`Kunde inte hämta växelkurser, använder reservkurser: ${(error as Error).message}`);
      // Cache the fallback briefly so we don't hammer the service.
      this.cache = { rates: FALLBACK_RATES, fetchedAt: Date.now() - TTL_MS + 10 * 60 * 1000 };
      return FALLBACK_RATES;
    }
  }
}
