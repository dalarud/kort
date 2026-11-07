import { z } from "zod";

/**
 * Schemas shared by server and client.
 *
 * The analysis schemas are also sent to Claude as a structured-output format, so
 * they deliberately avoid min/max/length constraints (not all JSON-schema keywords
 * are supported there). Ranges are enforced afterwards by the normalize* functions.
 */

export const CARD_TYPES = ["trading_card", "sticker", "game_card", "other"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const POPULARITY_LEVELS = ["legend", "superstar", "star", "regular", "unknown"] as const;
export type PlayerPopularity = (typeof POPULARITY_LEVELS)[number];

export const GradingSchema = z.object({
  isGraded: z.boolean().describe("True if the card is encapsulated in a grading slab"),
  company: z.string().nullable().describe("Grading company, e.g. PSA, BGS, SGC, CGC"),
  grade: z.number().nullable().describe("Numeric grade on the slab label, e.g. 9 or 9.5"),
  certNumber: z.string().nullable().describe("Certification number on the label, if readable"),
});
export type Grading = z.infer<typeof GradingSchema>;

export const CardIdentificationSchema = z.object({
  isCard: z.boolean().describe("False if the image does not show a sports trading card or sticker"),
  player: z.string().nullable(),
  team: z.string().nullable(),
  season: z.string().nullable().describe('Season or year, e.g. "2020-21" or "1998"'),
  manufacturer: z.string().nullable().describe("e.g. Panini, Topps, Upper Deck, Merlin, Futera"),
  set: z.string().nullable().describe('Product/set name, e.g. "Prizm Premier League"'),
  cardNumber: z.string().nullable(),
  parallel: z.string().nullable().describe('Parallel/variant, e.g. "Silver Prizm", "Gold Refractor"'),
  serialNumber: z.string().nullable().describe('Serial stamp exactly as printed, e.g. "23/99"'),
  printRun: z.number().int().nullable().describe("Print run from the serial number, e.g. 99"),
  insert: z.string().nullable().describe("Insert set name if the card is an insert"),
  isRookie: z.boolean(),
  isAutograph: z.boolean(),
  isMemorabilia: z.boolean().describe("Contains a jersey/patch/relic piece"),
  cardType: z.enum(CARD_TYPES),
  playerPopularity: z.enum(POPULARITY_LEVELS),
  grading: GradingSchema,
  searchQuery: z.string().describe("Best search query for finding sales of exactly this card"),
  confidence: z.number().describe("Overall identification confidence between 0 and 1"),
  notes: z.string().describe("Short notes in Swedish about the identification"),
});
export type CardIdentification = z.infer<typeof CardIdentificationSchema>;

export const ConditionSchema = z.object({
  centering: z.number().describe("1-10"),
  corners: z.number().describe("1-10"),
  edges: z.number().describe("1-10"),
  surface: z.number().describe("1-10"),
  overall: z.number().describe("Estimated PSA-equivalent grade 1-10"),
  summary: z.string().describe("One or two sentences in Swedish"),
  issues: z.array(z.string()).describe("Visible defects in Swedish"),
});
export type ConditionAssessment = z.infer<typeof ConditionSchema>;

export const CardAnalysisSchema = z.object({
  identification: CardIdentificationSchema,
  condition: ConditionSchema,
});
export type CardAnalysis = z.infer<typeof CardAnalysisSchema>;

// ---------------------------------------------------------------------------
// Currencies

export const DISPLAY_CURRENCIES = ["SEK", "EUR", "USD", "NOK", "DKK", "GBP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const DisplayCurrencySchema = z.enum(DISPLAY_CURRENCIES);

export const RatesSchema = z.object({
  base: z.literal("USD"),
  date: z.string(),
  source: z.enum(["ecb", "fallback"]),
  rates: z.record(z.string(), z.number()),
});
export type Rates = z.infer<typeof RatesSchema>;

// ---------------------------------------------------------------------------
// Valuation

export const PROVIDER_IDS = ["web_research", "ebay_active", "heuristic"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const ComparableSchema = z.object({
  title: z.string(),
  price: z.number(),
  currency: z.string(),
  url: z.string().nullable(),
  date: z.string().nullable(),
  kind: z.enum(["sold", "active"]),
  source: z.string(),
});
export type Comparable = z.infer<typeof ComparableSchema>;

/** A single provider's estimate. Prices are always in USD. */
export const ProviderEstimateSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  label: z.string(),
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  confidence: z.number(),
  comparables: z.array(ComparableSchema),
  note: z.string(),
});
export type ProviderEstimate = z.infer<typeof ProviderEstimateSchema>;

export const GRADING_VERDICTS = ["worth_it", "maybe", "not_worth_it", "already_graded"] as const;

export const ValuationSchema = z.object({
  currency: DisplayCurrencySchema,
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  confidence: z.number(),
  confidenceLabel: z.enum(["låg", "medel", "hög"]),
  sources: z.array(
    z.object({
      provider: z.enum(PROVIDER_IDS),
      label: z.string(),
      low: z.number(),
      mid: z.number(),
      high: z.number(),
      confidence: z.number(),
      note: z.string(),
      weight: z.number(),
    }),
  ),
  comparables: z.array(ComparableSchema.extend({ converted: z.number().nullable() })),
  gradeScenarios: z.array(
    z.object({ label: z.string(), grade: z.number().nullable(), value: z.number(), likely: z.boolean() }),
  ),
  gradingAdvice: z.object({
    verdict: z.enum(GRADING_VERDICTS),
    message: z.string(),
    cost: z.number(),
  }),
  rates: RatesSchema,
  generatedAt: z.string(),
  disclaimer: z.string(),
});
export type Valuation = z.infer<typeof ValuationSchema>;

// ---------------------------------------------------------------------------
// API contracts

export const ScanRequestSchema = z.object({
  front: z.string().min(100),
  back: z.string().min(100).nullable().optional(),
  currency: DisplayCurrencySchema.optional(),
});
export type ScanRequest = z.infer<typeof ScanRequestSchema>;

export const ValuateRequestSchema = z.object({
  identification: CardIdentificationSchema,
  condition: ConditionSchema,
  currency: DisplayCurrencySchema.optional(),
});
export type ValuateRequest = z.infer<typeof ValuateRequestSchema>;

export type AppMode = "live" | "demo";

export interface ScanResponse {
  id: string;
  mode: AppMode;
  identification: CardIdentification;
  condition: ConditionAssessment;
  valuation: Valuation;
}

export interface ValuateResponse {
  mode: AppMode;
  identification: CardIdentification;
  condition: ConditionAssessment;
  valuation: Valuation;
}

export interface HealthResponse {
  ok: true;
  mode: AppMode;
  model: string | null;
  providers: ProviderId[];
  requiresToken: boolean;
  version: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
