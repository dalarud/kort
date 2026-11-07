import { FALLBACK_RATES, SAMPLE_ANALYSES, type ProviderEstimate } from "@kort/shared";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { FxService } from "../fx";
import { decodeImage, sniffImageType } from "../images";
import { EbayBrowseProvider, filterListings } from "../pricing/ebay";
import { HeuristicProvider } from "../pricing/heuristic";
import { cacheKey, ValuationService } from "../pricing/service";
import { quantile, trim, fold } from "../pricing/stats";
import type { PriceProvider } from "../pricing/types";
import { fakeFx, fakeJpeg } from "./helpers";

const sample = (i = 0) => JSON.parse(JSON.stringify(SAMPLE_ANALYSES[i]));

describe("images", () => {
  it("sniffs supported formats", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("decodes data URLs and bare base64", () => {
    const fromDataUrl = decodeImage(fakeJpeg());
    expect(fromDataUrl).toMatchObject({ mediaType: "image/jpeg", bytes: 256 });
    expect(decodeImage(fromDataUrl.base64).mediaType).toBe("image/jpeg");
  });

  it("rejects garbage and oversized images", () => {
    expect(() => decodeImage("data:image/png;base64,!!!")).toThrow(/kunde inte läsas/);
    const huge = Buffer.alloc(9 * 1024 * 1024);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    expect(() => decodeImage(huge.toString("base64"))).toThrow(/för stor/);
  });
});

describe("config", () => {
  it("runs in demo mode without credentials", () => {
    const config = loadConfig({});
    expect(config.mode).toBe("demo");
    expect(config.webResearch).toBe(false);
    expect(config.defaultCurrency).toBe("SEK");
    expect(config.port).toBe(8787);
  });

  it("runs live with an API key and honours overrides", () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: "sk-test",
      PRICE_RESEARCH: "off",
      DEFAULT_CURRENCY: "eur",
      EBAY_CLIENT_ID: "id",
      EBAY_CLIENT_SECRET: "secret",
      RATE_LIMIT_MAX: "5",
    });
    expect(config.mode).toBe("live");
    expect(config.claudeModel).toBe("claude-opus-5-5");
    expect(config.webResearch).toBe(false);
    expect(config.defaultCurrency).toBe("EUR");
    expect(config.ebay?.marketplace).toBe("EBAY_US");
    expect(config.rateLimit.max).toBe(5);
    expect(loadConfig({ ANTHROPIC_API_KEY: "x", DEMO_MODE: "true" }).mode).toBe("demo");
  });
});

describe("stats", () => {
  it("computes quantiles and trims outliers", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(trim([1, 100, 5, 6, 7, 8, 9, 10, 11, 1000])).toEqual([6, 7, 8, 9, 10, 11]);
    expect(fold("Martin Ødegaard Müller")).toBe("martin odegaard muller");
  });
});

const listing = (title: string, value: string, currency = "USD") => ({
  title,
  price: { value, currency },
  itemWebUrl: `https://www.ebay.com/itm/${encodeURIComponent(title)}`,
});

describe("eBay", () => {
  it("filters listings to the identified card", () => {
    const card = sample(0).identification; // Lindvall, /50, raw
    const kept = filterListings(
      [
        listing("2023 Topps Chrome UCC Erik Lindvall Gold Refractor /50 RC", "80"),
        listing("2023 Topps Chrome UCC Erik Lindvall Gold Refractor /50 PSA 10", "300"),
        listing("2023 Topps Chrome UCC Erik Lindvall base RC", "2"),
        listing("2023 Topps Chrome UCC Someone Else Gold /50", "50"),
        listing("Topps Chrome lot of 50 cards Lindvall /50", "20"),
      ],
      card,
    );
    expect(kept.map((k) => k.price!.value)).toEqual(["80"]);
  });

  it("matches graded cards by company and grade", () => {
    const card = sample(2).identification; // PSA 9
    const kept = filterListings(
      [
        listing("2018 Prizm World Cup Marco Exempelini Silver PSA 9", "100"),
        listing("2018 Prizm World Cup Marco Exempelini Silver PSA 10", "250"),
        listing("2018 Prizm World Cup Marco Exempelini Silver", "40"),
      ],
      card,
    );
    expect(kept).toHaveLength(1);
  });

  it("estimates from active listings with a discount", async () => {
    const card = sample(0);
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }));
      }
      const items = ["60", "70", "80", "90", "100"].map((v) => listing(`Erik Lindvall Gold Refractor /50 ${v}`, v));
      return new Response(JSON.stringify({ itemSummaries: items }));
    });
    const provider = new EbayBrowseProvider({ clientId: "a", clientSecret: "b", marketplace: "EBAY_US" }, fetchMock as typeof fetch);
    const estimate = await provider.estimate({ ...card, rates: FALLBACK_RATES });

    expect(estimate?.mid).toBeCloseTo(80 * 0.85);
    expect(estimate?.comparables[0]!.kind).toBe("active");
    const searchUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(searchUrl.searchParams.get("category_ids")).toBe("261328");
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" });

    // Token is cached between searches.
    await provider.estimate({ ...card, rates: FALLBACK_RATES });
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("oauth2")).length).toBe(1);
  });

  it("returns null with too few matches", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "tok", expires_in: 7200 }))
        : new Response(JSON.stringify({ itemSummaries: [listing("Erik Lindvall /50", "10")] })),
    );
    const provider = new EbayBrowseProvider({ clientId: "a", clientSecret: "b", marketplace: "EBAY_US" }, fetchMock as typeof fetch);
    expect(await provider.estimate({ ...sample(0), rates: FALLBACK_RATES })).toBeNull();
  });
});

describe("ValuationService", () => {
  const marketEstimate: ProviderEstimate = {
    provider: "web_research",
    label: "Webb",
    low: 40,
    mid: 50,
    high: 60,
    confidence: 0.8,
    comparables: [],
    note: "",
  };

  it("combines providers and caches market data", async () => {
    const market: PriceProvider = { id: "web_research", timeoutMs: 1000, estimate: vi.fn(async () => marketEstimate) };
    const service = new ValuationService([market, new HeuristicProvider()], fakeFx, { gradingCostSek: 350 });
    const { identification, condition } = sample(0);

    const first = await service.valuate(identification, condition, "USD");
    const second = await service.valuate(identification, condition, "SEK");

    expect(market.estimate).toHaveBeenCalledTimes(1);
    expect(first.sources.map((s) => s.provider)).toEqual(["web_research", "heuristic"]);
    expect(first.mid).toBeGreaterThan(40);
    expect(second.currency).toBe("SEK");
    expect(second.mid).toBeGreaterThan(first.mid * 5);
  });

  it("ignores failing and slow providers", async () => {
    const log = vi.fn();
    const failing: PriceProvider = { id: "ebay_active", timeoutMs: 1000, estimate: async () => { throw new Error("boom"); } };
    const slow: PriceProvider = { id: "web_research", timeoutMs: 20, estimate: () => new Promise((r) => setTimeout(() => r(marketEstimate), 200)) };
    const service = new ValuationService([failing, slow, new HeuristicProvider()], fakeFx, { gradingCostSek: 350, log });
    const { identification, condition } = sample(1);
    const valuation = await service.valuate(identification, condition, "SEK");
    expect(valuation.sources.map((s) => s.provider)).toEqual(["heuristic"]);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("uses a cache key that ignores formatting but not grading", () => {
    const { identification, condition } = sample(0);
    const variant = { ...identification, player: "ERIK LINDVALL (demo)" };
    expect(cacheKey(identification, condition)).toBe(cacheKey(variant, condition));
    expect(cacheKey(identification, condition)).not.toBe(cacheKey(identification, { ...condition, overall: 5 }));
  });
});

describe("FxService", () => {
  it("fetches and caches ECB rates", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ base: "USD", date: "2026-11-06", rates: { SEK: 10, EUR: 0.9 } })));
    const fx = new FxService("https://fx.test", fetchMock as unknown as typeof fetch);
    const rates = await fx.getRates();
    await fx.getRates();
    expect(rates).toMatchObject({ source: "ecb", date: "2026-11-06" });
    expect(rates.rates.SEK).toBe(10);
    expect(rates.rates.NOK).toBe(FALLBACK_RATES.rates.NOK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when the service fails", async () => {
    const log = vi.fn();
    const fx = new FxService("https://fx.test", (async () => new Response("nope", { status: 500 })) as typeof fetch, log);
    expect((await fx.getRates()).source).toBe("fallback");
    expect(log).toHaveBeenCalled();
    expect((await new FxService(null).getRates()).source).toBe("fallback");
  });
});
