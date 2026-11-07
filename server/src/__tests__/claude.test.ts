import Anthropic from "@anthropic-ai/sdk";
import { FALLBACK_RATES, SAMPLE_ANALYSES } from "@kort/shared";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
import { ClaudeCardIdentifier, FALLBACK_BETA, mapAnthropicError } from "../identify/claude";
import { decodeImage } from "../images";
import { reportToEstimate, WebResearchProvider, type Report } from "../pricing/webResearch";
import { fakeJpeg } from "./helpers";

function stubClient(methods: { parse?: ReturnType<typeof vi.fn>; create?: ReturnType<typeof vi.fn> }) {
  return { beta: { messages: methods } } as unknown as Anthropic;
}

const images = { front: decodeImage(fakeJpeg()), back: decodeImage(fakeJpeg(1)) };
const sample = () => JSON.parse(JSON.stringify(SAMPLE_ANALYSES[0]));

describe("ClaudeCardIdentifier", () => {
  it("sends both images with structured output and normalises the result", async () => {
    const analysis = sample();
    analysis.identification.player = "  Erik  Lindvall ";
    analysis.condition.overall = 11;
    const parse = vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: analysis });
    const identifier = new ClaudeCardIdentifier(stubClient({ parse }), "claude-opus-5-5");

    const result = await identifier.identify(images);

    expect(result.identification.player).toBe("Erik Lindvall");
    expect(result.condition.overall).toBe(10);

    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.betas).toEqual([FALLBACK_BETA]);
    expect(params.fallbacks).toBe("default");
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config.format.type).toBe("json_schema");
    const content = params.messages[0].content;
    expect(content.filter((b: { type: string }) => b.type === "image")).toHaveLength(2);
    expect(content[1].source.media_type).toBe("image/jpeg");
  });

  it("maps refusals and missing output to user-facing errors", async () => {
    const refused = new ClaudeCardIdentifier(
      stubClient({ parse: vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null }) }),
      "m",
    );
    await expect(refused.identify(images)).rejects.toMatchObject({ code: "AI_REFUSED" });

    const empty = new ClaudeCardIdentifier(
      stubClient({ parse: vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: null }) }),
      "m",
    );
    await expect(empty.identify(images)).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("maps SDK errors", async () => {
    const rateLimited = new Anthropic.RateLimitError(429, {}, "slow down", new Headers());
    const identifier = new ClaudeCardIdentifier(stubClient({ parse: vi.fn().mockRejectedValue(rateLimited) }), "m");
    await expect(identifier.identify(images)).rejects.toMatchObject({ code: "AI_BUSY", statusCode: 503 });

    expect((mapAnthropicError(new Anthropic.AuthenticationError(401, {}, "bad key", new Headers())) as AppError).code).toBe("AI_AUTH");
    expect((mapAnthropicError(new Anthropic.APIConnectionError({ message: "down" })) as AppError).code).toBe("AI_UNAVAILABLE");
    expect((mapAnthropicError(new Anthropic.InternalServerError(500, {}, "oops", new Headers())) as AppError).code).toBe("AI_BUSY");
  });
});

const report: Report = {
  found_exact_card: true,
  currency: "GBP",
  low: 30,
  mid: 45,
  high: 60,
  confidence: 0.95,
  comparables: [
    { title: "Sale 1", price: 44, currency: "GBP", url: "https://www.ebay.co.uk/itm/1", date: "2026-10-30", kind: "sold", source: "eBay" },
    { title: "Sale 2", price: 47, currency: "GBP", url: "javascript:alert(1)", date: "2026-10-12", kind: "sold", source: "eBay" },
    { title: "Sale 3", price: 41, currency: "GBP", url: null, date: null, kind: "sold", source: "130point" },
  ],
  summary: "Tre nyliga försäljningar.",
};

describe("reportToEstimate", () => {
  const context = { ...sample(), rates: FALLBACK_RATES };

  it("converts to USD, caps confidence and drops unsafe links", () => {
    const estimate = reportToEstimate(report, context)!;
    expect(estimate.mid).toBeCloseTo(60);
    expect(estimate.confidence).toBe(0.85);
    expect(estimate.comparables[1]!.url).toBeNull();
    expect(estimate.comparables[0]!.url).toBe("https://www.ebay.co.uk/itm/1");
  });

  it("lowers confidence when the exact card was not found", () => {
    expect(reportToEstimate({ ...report, found_exact_card: false }, context)!.confidence).toBe(0.4);
    expect(reportToEstimate({ ...report, comparables: [] }, context)!.confidence).toBe(0.45);
  });

  it("rejects unusable reports", () => {
    expect(reportToEstimate({ ...report, currency: "XYZ" }, context)).toBeNull();
    expect(reportToEstimate({ ...report, mid: 0 }, context)).toBeNull();
  });
});

describe("WebResearchProvider", () => {
  const context = { ...sample(), rates: FALLBACK_RATES };

  it("continues paused turns and reads the report tool call", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "pause_turn", content: [{ type: "text", text: "Söker…" }] })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "report_valuation", input: report }],
      });
    const provider = new WebResearchProvider(stubClient({ create }), "claude-opus-5-5");
    const estimate = await provider.estimate(context);

    expect(estimate?.provider).toBe("web_research");
    expect(create).toHaveBeenCalledTimes(2);
    const first = create.mock.calls[0]![0];
    expect(first.tools.map((t: { name: string }) => t.name)).toEqual(["web_search", "report_valuation"]);
    expect(first.tools[1].strict).toBe(true);
    expect(first.tool_choice).toEqual({ type: "auto" });
    // The paused assistant turn is sent back unchanged.
    expect(create.mock.calls[1]![0].messages[1]).toEqual({ role: "assistant", content: [{ type: "text", text: "Söker…" }] });
  });

  it("nudges the model to report if it ends without the tool", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Klart" }] })
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "report_valuation", input: report }] });
    const estimate = await new WebResearchProvider(stubClient({ create }), "m").estimate(context);
    expect(estimate).not.toBeNull();
    expect(create.mock.calls[1]![0].messages.at(-1).content).toMatch(/report_valuation/);
  });

  it("returns null on refusal or invalid tool input", async () => {
    const refusal = vi.fn().mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect(await new WebResearchProvider(stubClient({ create: refusal }), "m").estimate(context)).toBeNull();

    const invalid = vi.fn().mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t", name: "report_valuation", input: { mid: "mycket" } }],
    });
    expect(await new WebResearchProvider(stubClient({ create: invalid }), "m").estimate(context)).toBeNull();
  });
});
