import type { ProviderEstimate } from "../schemas";
import { clamp } from "../normalize";

export interface AggregateResult {
  low: number;
  mid: number;
  high: number;
  confidence: number;
  /** Normalised weight per provider, same order as the input. */
  weights: number[];
}

/**
 * Combines provider estimates (all in the same currency).
 *
 * Card prices are roughly log-normally distributed, so values are combined with a
 * weighted geometric mean. Weights are confidence², which lets a source with real
 * sales data dominate a low-confidence heuristic. When sources disagree the range
 * is widened and the confidence lowered.
 */
export function aggregate(estimates: ProviderEstimate[]): AggregateResult {
  const valid = estimates.filter((e) => e.mid > 0 && e.low > 0 && e.high > 0 && e.confidence > 0);
  if (valid.length === 0) {
    return { low: 0, mid: 0, high: 0, confidence: 0, weights: estimates.map(() => 0) };
  }

  const raw = valid.map((e) => clamp(e.confidence, 0.01, 1) ** 2);
  const total = raw.reduce((a, b) => a + b, 0);
  const w = raw.map((x) => x / total);

  const geo = (pick: (e: ProviderEstimate) => number) =>
    Math.exp(valid.reduce((acc, e, i) => acc + w[i]! * Math.log(pick(e)), 0));

  const mid = geo((e) => e.mid);
  let low = Math.min(geo((e) => e.low), mid);
  let high = Math.max(geo((e) => e.high), mid);

  // Disagreement between sources: weighted std-dev of log(mid).
  const logMid = Math.log(mid);
  const variance = valid.reduce((acc, e, i) => acc + w[i]! * (Math.log(e.mid) - logMid) ** 2, 0);
  const spread = Math.sqrt(variance);
  if (spread > 0) {
    low = Math.min(low, mid * Math.exp(-spread));
    high = Math.max(high, mid * Math.exp(spread));
  }

  const meanConfidence = valid.reduce((acc, e, i) => acc + w[i]! * clamp(e.confidence, 0, 1), 0);
  const confidence = clamp(meanConfidence * (1 - Math.min(0.5, spread / 2)), 0, 1);

  const weights = estimates.map((e) => {
    const index = valid.indexOf(e);
    return index === -1 ? 0 : w[index]!;
  });

  return { low, mid, high, confidence, weights };
}

export function confidenceLabel(confidence: number): "låg" | "medel" | "hög" {
  if (confidence >= 0.65) return "hög";
  if (confidence >= 0.4) return "medel";
  return "låg";
}
