import { convert, fromUsd, roundMoney } from "../currency";
import type {
  CardIdentification,
  ConditionAssessment,
  DisplayCurrency,
  ProviderEstimate,
  Rates,
  Valuation,
} from "../schemas";
import { aggregate, confidenceLabel } from "./aggregate";
import { gradeScenarios } from "./condition";

export const DISCLAIMER =
  "Värderingen är en uppskattning baserad på tillgänglig marknadsdata och en AI-analys av bilden. " +
  "Faktiskt försäljningspris kan avvika kraftigt beroende på skick, äkthet, efterfrågan och försäljningskanal. " +
  "Kontrollera alltid identifieringen och jämförbara försäljningar innan du köper eller säljer.";

const MAX_COMPARABLES = 12;

export interface BuildValuationInput {
  estimates: ProviderEstimate[];
  identification: CardIdentification;
  condition: ConditionAssessment;
  currency: DisplayCurrency;
  rates: Rates;
  /** Cost of grading one card, in USD. */
  gradingCostUsd: number;
  now?: Date;
}

/** Turns provider estimates (USD) into a complete valuation in the requested currency. */
export function buildValuation(input: BuildValuationInput): Valuation {
  const { estimates, identification, condition, currency, rates } = input;
  const result = aggregate(estimates);
  const money = (usd: number) => roundMoney(fromUsd(usd, currency, rates));

  const { scenarios, advice } = gradeScenarios(result.mid, identification, condition, input.gradingCostUsd);

  const comparables = estimates
    .flatMap((e) => e.comparables)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "sold" ? -1 : 1;
      return (b.date ?? "").localeCompare(a.date ?? "");
    })
    .slice(0, MAX_COMPARABLES)
    .map((c) => {
      const converted = convert(c.price, c.currency, currency, rates);
      return { ...c, converted: converted == null ? null : roundMoney(converted) };
    });

  return {
    currency,
    low: money(result.low),
    mid: money(result.mid),
    high: money(result.high),
    confidence: Math.round(result.confidence * 100) / 100,
    confidenceLabel: confidenceLabel(result.confidence),
    sources: estimates.map((e, i) => ({
      provider: e.provider,
      label: e.label,
      low: money(e.low),
      mid: money(e.mid),
      high: money(e.high),
      confidence: Math.round(e.confidence * 100) / 100,
      note: e.note,
      weight: Math.round((result.weights[i] ?? 0) * 100) / 100,
    })),
    comparables,
    gradeScenarios: scenarios.map((s) => ({ ...s, value: money(s.value) })),
    gradingAdvice: { ...advice, cost: money(input.gradingCostUsd) },
    rates,
    generatedAt: (input.now ?? new Date()).toISOString(),
    disclaimer: DISCLAIMER,
  };
}
