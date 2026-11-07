import type Anthropic from "@anthropic-ai/sdk";
import { toUsd, type ProviderEstimate } from "@kort/shared";
import { z } from "zod";
import { FALLBACK_BETA } from "../identify/claude";
import type { PriceContext, PriceProvider } from "./types";

const MAX_TURNS = 5;

const ComparableInput = z.object({
  title: z.string(),
  price: z.number(),
  currency: z.string(),
  url: z.string().nullable(),
  date: z.string().nullable(),
  kind: z.enum(["sold", "active"]),
  source: z.string(),
});

export const ReportSchema = z.object({
  found_exact_card: z.boolean(),
  currency: z.string(),
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  confidence: z.number(),
  comparables: z.array(ComparableInput),
  summary: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

const nullableString = { type: ["string", "null"] } as const;

export const REPORT_TOOL: Anthropic.Beta.BetaTool = {
  name: "report_valuation",
  description:
    "Rapportera värderingen av kortet när du har samlat in tillräckligt med prisunderlag. Anropa exakt en gång, sist.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found_exact_card", "currency", "low", "mid", "high", "confidence", "comparables", "summary"],
    properties: {
      found_exact_card: {
        type: "boolean",
        description: "True om du hittade försäljningar av exakt samma kort (samma serie, parallell, numrering och gradering).",
      },
      currency: { type: "string", description: "ISO-valutakod för low/mid/high, t.ex. USD, GBP, EUR eller SEK." },
      low: { type: "number", description: "Lågt men realistiskt pris för kortet i det angivna skicket." },
      mid: { type: "number", description: "Mest sannolika försäljningspris." },
      high: { type: "number", description: "Högt men realistiskt pris." },
      confidence: { type: "number", description: "Säkerhet 0–1 i värderingen." },
      comparables: {
        type: "array",
        description: "Upp till 8 jämförbara försäljningar/annonser du faktiskt hittade.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "price", "currency", "url", "date", "kind", "source"],
          properties: {
            title: { type: "string" },
            price: { type: "number" },
            currency: { type: "string" },
            url: nullableString,
            date: { ...nullableString, description: "Försäljningsdatum YYYY-MM-DD om känt" },
            kind: { type: "string", enum: ["sold", "active"] },
            source: { type: "string", description: "T.ex. eBay, 130point, PSA APR, Tradera, Card Ladder" },
          },
        },
      },
      summary: { type: "string", description: "2–3 meningar på svenska om underlaget och hur du kom fram till priset." },
    },
  },
};

const WEB_SEARCH_TOOL: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
};

const SYSTEM_PROMPT = `Du är en erfaren värderare av fotbollskort. Du tar fram ett realistiskt marknadsvärde för ett identifierat kort utifrån faktiska försäljningar.

Arbetssätt:
1. Sök efter nyligen sålda exemplar av exakt detta kort (samma säsong, serie, kortnummer, parallell, numrering och gradering). Bra källor: eBay sålda annonser, 130point.com, PSA Auction Prices Realized, Card Ladder, PriceCharting, Tradera och Cardmarket.
2. Föredra försäljningar från de senaste 90 dagarna. Utropspriser för aktiva annonser är normalt högre än slutpriser – använd dem bara som komplement.
3. Justera för skick: ett ograderat kort värderas utifrån det uppskattade skicket; graderade kort jämförs med samma företag och betyg.
4. Om exakt kort saknas, använd närmaste jämförbara (t.ex. basversionen eller en närliggande parallell) och sänk confidence.
5. Hitta aldrig på försäljningar eller länkar. Ta bara med jämförelser du faktiskt har sett i sökresultaten.

Avsluta alltid genom att anropa verktyget report_valuation med ditt resultat.`;

function describeContext({ identification, condition }: PriceContext): string {
  const skick = identification.grading.isGraded
    ? `Graderat: ${identification.grading.company ?? "?"} ${identification.grading.grade ?? "?"}`
    : `Ograderat, uppskattat skick ungefär PSA ${condition.overall} (centrering ${condition.centering}, hörn ${condition.corners}, kanter ${condition.edges}, yta ${condition.surface})`;
  return [
    "Värdera detta fotbollskort:",
    "```json",
    JSON.stringify(
      {
        player: identification.player,
        team: identification.team,
        season: identification.season,
        manufacturer: identification.manufacturer,
        set: identification.set,
        cardNumber: identification.cardNumber,
        parallel: identification.parallel,
        serialNumber: identification.serialNumber,
        insert: identification.insert,
        rookie: identification.isRookie,
        autograph: identification.isAutograph,
        memorabilia: identification.isMemorabilia,
        cardType: identification.cardType,
        suggestedSearch: identification.searchQuery,
      },
      null,
      2,
    ),
    "```",
    skick,
  ].join("\n");
}

/** Converts the tool report into a provider estimate (USD) with a capped confidence. */
export function reportToEstimate(report: Report, context: PriceContext): ProviderEstimate | null {
  const usd = (value: number) => toUsd(value, report.currency, context.rates);
  const low = usd(report.low);
  const mid = usd(report.mid);
  const high = usd(report.high);
  if (low == null || mid == null || high == null || mid <= 0) return null;

  const sold = report.comparables.filter((c) => c.kind === "sold").length;
  const cap = !report.found_exact_card ? 0.4 : sold >= 3 ? 0.85 : sold >= 1 ? 0.65 : 0.45;

  return {
    provider: "web_research",
    label: "Webbsökning – sålda kort",
    low: Math.min(low, mid),
    mid,
    high: Math.max(high, mid),
    confidence: Math.max(0.05, Math.min(cap, report.confidence)),
    comparables: report.comparables.slice(0, 8).map((c) => ({
      ...c,
      url: c.url && /^https?:\/\//i.test(c.url) ? c.url : null,
    })),
    note: report.summary,
  };
}

/**
 * Lets Claude search the web for recent sales of the identified card and report the
 * result through a strict custom tool.
 */
export class WebResearchProvider implements PriceProvider {
  readonly id = "web_research" as const;
  readonly timeoutMs = 150_000;

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async estimate(context: PriceContext): Promise<ProviderEstimate | null> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: describeContext(context) }];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: SYSTEM_PROMPT,
          tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
          tool_choice: { type: "auto" },
          messages,
        },
        { timeout: this.timeoutMs },
      );

      if (response.stop_reason === "refusal") return null;

      const call = response.content.find(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use" && block.name === REPORT_TOOL.name,
      );
      if (call) {
        const parsed = ReportSchema.safeParse(call.input);
        return parsed.success ? reportToEstimate(parsed.data, context) : null;
      }

      if (response.stop_reason === "pause_turn") {
        // Server-side web search paused a long turn – send it back to continue.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason === "end_turn") {
        messages.push(
          { role: "assistant", content: response.content },
          { role: "user", content: "Anropa nu verktyget report_valuation med ditt resultat." },
        );
        continue;
      }
      return null;
    }
    return null;
  }
}
