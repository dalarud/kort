import type { CardIdentification, ConditionAssessment, PlayerPopularity, ProviderEstimate } from "../schemas";
import { currentConditionMultiplier } from "./condition";

/**
 * Rule based estimate used as a floor/fallback when no market data is available.
 * All values are in USD. The factors are rough market averages and are clearly
 * labelled as such in the UI (low confidence).
 */

interface Tier {
  pattern: RegExp;
  base: number;
  label: string;
}

const GAME_CARD_PATTERN = /adrenalyn|match attax|kick off|top trumps|xl\b/i;
const STICKER_PATTERN = /sticker|klistermärke|calciatori|figurine|album/i;

const PRODUCT_TIERS: Tier[] = [
  { pattern: /national treasures|flawless|immaculate|eminence|definitive|transcendent|dynasty|superfractor/i, base: 40, label: "Exklusiv premiumserie" },
  { pattern: /prizm|select|obsidian|chrome|finest|mosaic|optic|merlin|sapphire|museum|inception|knockout|revolution|spectra|stadium club|black|noir|gold label|deco/i, base: 2.5, label: "Premiumserie" },
  { pattern: /donruss|score|topps|panini|upper deck|futera|bowman|leaf|pro set|euroflash/i, base: 1, label: "Basserie" },
];

const POPULARITY_FACTOR: Record<PlayerPopularity, number> = {
  legend: 25,
  superstar: 15,
  star: 4,
  regular: 1,
  unknown: 1,
};

const POPULARITY_LABEL: Record<PlayerPopularity, string> = {
  legend: "legendar",
  superstar: "superstjärna",
  star: "stjärna",
  regular: "ordinarie spelare",
  unknown: "okänd popularitet",
};

export function productTier(card: CardIdentification): Tier {
  const haystack = [card.manufacturer, card.set, card.parallel, card.insert].filter(Boolean).join(" ");
  if (card.cardType === "game_card" || GAME_CARD_PATTERN.test(haystack)) {
    return { pattern: GAME_CARD_PATTERN, base: 0.25, label: "Samlarspel (t.ex. Adrenalyn/Match Attax)" };
  }
  if (card.cardType === "sticker" || STICKER_PATTERN.test(haystack)) {
    return { pattern: STICKER_PATTERN, base: 0.3, label: "Klistermärke" };
  }
  return PRODUCT_TIERS.find((tier) => tier.pattern.test(haystack)) ?? { pattern: /./, base: 0.6, label: "Okänd serie" };
}

export function seasonYear(season: string | null): number | null {
  if (!season) return null;
  const match = season.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function vintageFactor(year: number | null): number {
  if (year == null) return 1;
  if (year < 1970) return 8;
  if (year < 1980) return 4;
  if (year < 1990) return 2;
  if (year < 2000) return 1.3;
  return 1;
}

export function scarcityFactor(card: CardIdentification): number {
  const run = card.printRun;
  if (run != null && run > 0) {
    if (run === 1) return 60;
    if (run <= 5) return 30;
    if (run <= 10) return 18;
    if (run <= 25) return 10;
    if (run <= 50) return 6;
    if (run <= 99) return 4;
    if (run <= 199) return 2.5;
    if (run <= 499) return 1.6;
    return 1.2;
  }
  return card.parallel ? 1.8 : 1;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

export function heuristicEstimate(card: CardIdentification, condition: ConditionAssessment): ProviderEstimate {
  const tier = productTier(card);
  const factors: Array<[string, number]> = [];

  const popularity = POPULARITY_FACTOR[card.playerPopularity];
  if (popularity !== 1) factors.push([POPULARITY_LABEL[card.playerPopularity], popularity]);

  const vintage = vintageFactor(seasonYear(card.season));
  if (vintage !== 1) factors.push(["ålder", vintage]);

  const scarcity = scarcityFactor(card);
  if (scarcity !== 1) factors.push([card.printRun ? `numrerat /${card.printRun}` : "parallell", scarcity]);

  if (card.isRookie) factors.push(["rookie", 2.5]);
  if (card.isAutograph) factors.push(["autograf", 10]);
  if (card.isMemorabilia) factors.push(["tröjbit/patch", card.isAutograph ? 1.5 : 3]);
  if (card.insert) factors.push(["insert", 1.5]);

  const conditionFactor = currentConditionMultiplier(card, condition);
  factors.push([
    card.grading.isGraded ? `gradering ${card.grading.company ?? ""} ${card.grading.grade ?? ""}`.replace(/\s+/g, " ").trim() : `skick ~${condition.overall}`,
    conditionFactor,
  ]);

  const mid = Math.max(0.05, factors.reduce((value, [, factor]) => value * factor, tier.base));
  const confidence = card.confidence < 0.5 ? 0.12 : 0.2;

  const note = `Regelbaserad uppskattning: ${tier.label} (bas ${fmt(tier.base)} USD)${factors
    .map(([label, factor]) => ` × ${label} ${fmt(Math.round(factor * 100) / 100)}`)
    .join("")}. Används som riktvärde när marknadsdata saknas.`;

  return {
    provider: "heuristic",
    label: "Riktvärde (regelmotor)",
    low: mid * 0.5,
    mid,
    high: mid * 2,
    confidence,
    comparables: [],
    note,
  };
}
