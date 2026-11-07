import {
  buildValuation,
  toUsd,
  type CardIdentification,
  type ConditionAssessment,
  type DisplayCurrency,
  type ProviderEstimate,
  type Valuation,
} from "@kort/shared";
import type { FxSource } from "../fx";
import type { PriceProvider } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

export interface ValuationServiceOptions {
  gradingCostSek: number;
  log?: (msg: string) => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout efter ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Cache key: the fields that determine price, normalised. */
export function cacheKey(card: CardIdentification, condition: ConditionAssessment): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9/]+/g, "");
  return JSON.stringify([
    norm(card.player),
    norm(card.season),
    norm(card.manufacturer),
    norm(card.set),
    norm(card.cardNumber),
    norm(card.parallel),
    norm(card.insert),
    card.printRun,
    card.isRookie,
    card.isAutograph,
    card.isMemorabilia,
    card.cardType,
    card.playerPopularity,
    card.grading.isGraded ? `${norm(card.grading.company)}${card.grading.grade}` : `raw${Math.round(condition.overall)}`,
  ]);
}

/**
 * Runs all price providers in parallel (each with its own timeout), caches the raw
 * USD estimates and builds the final valuation in the requested currency.
 */
export class ValuationService {
  private readonly cache = new Map<string, { estimates: ProviderEstimate[]; at: number }>();

  constructor(
    private readonly providers: PriceProvider[],
    private readonly fx: FxSource,
    private readonly options: ValuationServiceOptions,
  ) {}

  get providerIds() {
    return this.providers.map((p) => p.id);
  }

  async valuate(
    identification: CardIdentification,
    condition: ConditionAssessment,
    currency: DisplayCurrency,
  ): Promise<Valuation> {
    const rates = await this.fx.getRates();
    const key = cacheKey(identification, condition);
    let estimates = this.cached(key);

    if (!estimates) {
      const settled = await Promise.allSettled(
        this.providers.map((provider) =>
          withTimeout(provider.estimate({ identification, condition, rates }), provider.timeoutMs),
        ),
      );
      estimates = [];
      settled.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) estimates!.push(result.value);
        else if (result.status === "rejected") {
          this.options.log?.(`Prisleverantör ${this.providers[i]!.id} misslyckades: ${(result.reason as Error)?.message}`);
        }
      });
      // Only cache when we got something better than the heuristic alone.
      if (estimates.some((e) => e.provider !== "heuristic")) this.store(key, estimates);
    }

    return buildValuation({
      estimates,
      identification,
      condition,
      currency,
      rates,
      gradingCostUsd: toUsd(this.options.gradingCostSek, "SEK", rates) ?? 35,
    });
  }

  private cached(key: string): ProviderEstimate[] | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    // Refresh LRU position.
    this.cache.delete(key);
    this.cache.set(key, hit);
    return hit.estimates;
  }

  private store(key: string, estimates: ProviderEstimate[]) {
    this.cache.set(key, { estimates, at: Date.now() });
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
