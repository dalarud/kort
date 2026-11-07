import { describe, expect, it } from "vitest";
import {
  aggregate,
  buildSearchQuery,
  buildValuation,
  confidenceLabel,
  convert,
  FALLBACK_RATES,
  formatMoney,
  gradeMultiplier,
  gradeScenarios,
  heuristicEstimate,
  normalizeCondition,
  normalizeIdentification,
  parsePrintRun,
  predictGrade,
  productTier,
  rawConditionMultiplier,
  roundMoney,
  SAMPLE_ANALYSES,
  scarcityFactor,
  seasonYear,
  type CardIdentification,
  type ProviderEstimate,
} from "./index";

const [chromeRookie, sticker, gradedPrizm, adrenalyn] = SAMPLE_ANALYSES.map((s) => JSON.parse(JSON.stringify(s)) as typeof s);

function estimate(partial: Partial<ProviderEstimate>): ProviderEstimate {
  return {
    provider: "web_research",
    label: "test",
    low: 8,
    mid: 10,
    high: 12,
    confidence: 0.8,
    comparables: [],
    note: "",
    ...partial,
  };
}

describe("normalize", () => {
  it("parses print runs from serial numbers", () => {
    expect(parsePrintRun("23/99")).toBe(99);
    expect(parsePrintRun("1 / 1")).toBe(1);
    expect(parsePrintRun("/25")).toBe(25);
    expect(parsePrintRun("ingen")).toBeNull();
    expect(parsePrintRun(null)).toBeNull();
  });

  it("clamps numbers, cleans text and derives print run", () => {
    const input: CardIdentification = {
      ...chromeRookie!.identification,
      player: "  Erik   Lindvall ",
      team: "unknown",
      serialNumber: "07/25",
      printRun: null,
      confidence: 1.7,
      searchQuery: "",
    };
    const out = normalizeIdentification(input);
    expect(out.player).toBe("Erik Lindvall");
    expect(out.team).toBeNull();
    expect(out.printRun).toBe(25);
    expect(out.confidence).toBe(1);
    expect(out.searchQuery).toContain("/25");
  });

  it("drops grading details when the card is not graded", () => {
    const out = normalizeIdentification({
      ...chromeRookie!.identification,
      grading: { isGraded: false, company: "PSA", grade: 10, certNumber: "1" },
    });
    expect(out.grading).toEqual({ isGraded: false, company: null, grade: null, certNumber: null });
  });

  it("rounds grades to half steps and uppercases company", () => {
    const out = normalizeIdentification({
      ...chromeRookie!.identification,
      grading: { isGraded: true, company: "psa", grade: 9.3, certNumber: null },
    });
    expect(out.grading.company).toBe("PSA");
    expect(out.grading.grade).toBe(9.5);
  });

  it("clamps condition scores to 1–10", () => {
    const out = normalizeCondition({ centering: 12, corners: 0, edges: 7.2, surface: 8.8, overall: 9.74, summary: " ok ", issues: ["", "repa"] });
    expect(out).toMatchObject({ centering: 10, corners: 1, edges: 7, surface: 9, overall: 9.5, summary: "ok", issues: ["repa"] });
  });

  it("builds a search query without repeating the manufacturer", () => {
    const query = buildSearchQuery({ ...chromeRookie!.identification, set: "Topps Chrome UCC" });
    expect(query).toBe("2023-24 Topps Chrome UCC Erik Lindvall (DEMO) Gold Refractor #57 /50 RC");
  });
});

describe("currency", () => {
  it("converts via USD", () => {
    expect(convert(10, "USD", "SEK", FALLBACK_RATES)).toBeCloseTo(99);
    expect(convert(99, "SEK", "USD", FALLBACK_RATES)).toBeCloseTo(10);
    expect(convert(90, "EUR", "SEK", FALLBACK_RATES)).toBeCloseTo(990);
    expect(convert(5, "SEK", "SEK", FALLBACK_RATES)).toBe(5);
    expect(convert(5, "XYZ", "SEK", FALLBACK_RATES)).toBeNull();
  });

  it("rounds money sensibly", () => {
    expect(roundMoney(0.374)).toBe(0.37);
    expect(roundMoney(12.4)).toBe(12);
    expect(roundMoney(1234)).toBe(1230);
    expect(roundMoney(23456)).toBe(23500);
    expect(roundMoney(-3)).toBe(0);
  });

  it("formats Swedish kronor", () => {
    expect(formatMoney(1250, "SEK").replace(/\s/g, " ")).toBe("1 250 kr");
    expect(formatMoney(3.5, "SEK").replace(/\s/g, " ")).toBe("3,50 kr");
  });
});

describe("condition & grading", () => {
  it("has a monotonic grade curve", () => {
    let previous = 0;
    for (let g = 1; g <= 10; g += 0.5) {
      const m = gradeMultiplier(g);
      expect(m).toBeGreaterThanOrEqual(previous);
      previous = m;
    }
    expect(gradeMultiplier(8)).toBe(1);
    expect(gradeMultiplier(10)).toBe(3);
    expect(gradeMultiplier(10, "BGS")).toBe(5);
  });

  it("maps raw condition to multipliers", () => {
    expect(rawConditionMultiplier(10)).toBeGreaterThan(rawConditionMultiplier(9));
    expect(rawConditionMultiplier(9)).toBe(1);
    expect(rawConditionMultiplier(2)).toBeLessThan(rawConditionMultiplier(5));
  });

  it("predicts grades conservatively", () => {
    expect(predictGrade(10)).toBe(10);
    expect(predictGrade(9.5)).toBe(9);
    expect(predictGrade(9)).toBe(9);
    expect(predictGrade(8.5)).toBe(8);
    expect(predictGrade(1)).toBe(1);
  });

  it("recommends grading for a valuable card in top condition", () => {
    const card = chromeRookie!.identification;
    const condition = { ...chromeRookie!.condition, overall: 10 };
    const { advice, scenarios } = gradeScenarios(200, card, condition, 30);
    expect(advice.verdict).toBe("worth_it");
    expect(scenarios.find((s) => s.likely)?.label).toBe("PSA 10");
  });

  it("advises against grading cheap cards", () => {
    const { advice } = gradeScenarios(2, sticker!.identification, sticker!.condition, 30);
    expect(advice.verdict).toBe("not_worth_it");
  });

  it("marks graded cards as already graded", () => {
    const { advice, scenarios } = gradeScenarios(100, gradedPrizm!.identification, gradedPrizm!.condition, 30);
    expect(advice.verdict).toBe("already_graded");
    expect(scenarios[0]).toMatchObject({ grade: 9, value: 100, likely: true });
    expect(scenarios.find((s) => s.grade === 10)!.value).toBeCloseTo(200);
  });
});

describe("heuristic", () => {
  it("recognises product tiers", () => {
    expect(productTier(adrenalyn!.identification).label).toMatch(/Samlarspel/);
    expect(productTier(sticker!.identification).label).toBe("Klistermärke");
    expect(productTier(chromeRookie!.identification).label).toBe("Premiumserie");
    expect(productTier({ ...chromeRookie!.identification, set: "National Treasures", parallel: null }).label).toBe("Exklusiv premiumserie");
  });

  it("reads season years", () => {
    expect(seasonYear("2020-21")).toBe(2020);
    expect(seasonYear("1998")).toBe(1998);
    expect(seasonYear("okänd")).toBeNull();
  });

  it("values scarcer cards higher", () => {
    expect(scarcityFactor({ ...chromeRookie!.identification, printRun: 1 })).toBeGreaterThan(scarcityFactor({ ...chromeRookie!.identification, printRun: 99 }));
  });

  it("orders typical cards sensibly", () => {
    const rookie = heuristicEstimate(chromeRookie!.identification, chromeRookie!.condition);
    const cheapSticker = heuristicEstimate(sticker!.identification, sticker!.condition);
    const gameCard = heuristicEstimate(adrenalyn!.identification, adrenalyn!.condition);
    expect(rookie.mid).toBeGreaterThan(50);
    expect(cheapSticker.mid).toBeLessThan(1);
    expect(gameCard.mid).toBeLessThan(1);
    expect(rookie.low).toBeLessThan(rookie.mid);
    expect(rookie.high).toBeGreaterThan(rookie.mid);
    expect(rookie.confidence).toBeLessThanOrEqual(0.2);
    expect(rookie.note).toContain("numrerat /50");
  });

  it("increases value for autographs and better condition", () => {
    const base = heuristicEstimate(chromeRookie!.identification, chromeRookie!.condition).mid;
    const auto = heuristicEstimate({ ...chromeRookie!.identification, isAutograph: true }, chromeRookie!.condition).mid;
    const worn = heuristicEstimate(chromeRookie!.identification, { ...chromeRookie!.condition, overall: 5 }).mid;
    expect(auto).toBeGreaterThan(base * 5);
    expect(worn).toBeLessThan(base);
  });
});

describe("aggregate", () => {
  it("returns zeros when nothing is usable", () => {
    expect(aggregate([])).toMatchObject({ mid: 0, confidence: 0 });
  });

  it("lets confident market data dominate the heuristic", () => {
    const result = aggregate([
      estimate({ mid: 100, low: 80, high: 120, confidence: 0.8 }),
      estimate({ provider: "heuristic", mid: 10, low: 5, high: 20, confidence: 0.2 }),
    ]);
    expect(result.mid).toBeGreaterThan(80);
    expect(result.mid).toBeLessThan(100);
    expect(result.weights[0]).toBeGreaterThan(0.9);
    expect(result.low).toBeLessThan(result.mid);
    expect(result.high).toBeGreaterThan(result.mid);
  });

  it("lowers confidence when sources disagree", () => {
    const agree = aggregate([estimate({ mid: 100 }), estimate({ mid: 105, provider: "ebay_active" })]);
    const disagree = aggregate([estimate({ mid: 100 }), estimate({ mid: 1000, provider: "ebay_active" })]);
    expect(disagree.confidence).toBeLessThan(agree.confidence);
    expect(disagree.high / disagree.low).toBeGreaterThan(agree.high / agree.low);
  });

  it("ignores invalid estimates", () => {
    const result = aggregate([estimate({ mid: 50 }), estimate({ mid: 0, low: 0, high: 0 })]);
    expect(result.mid).toBeCloseTo(50);
    expect(result.weights).toEqual([1, 0]);
  });

  it("labels confidence", () => {
    expect(confidenceLabel(0.8)).toBe("hög");
    expect(confidenceLabel(0.5)).toBe("medel");
    expect(confidenceLabel(0.1)).toBe("låg");
  });
});

describe("buildValuation", () => {
  it("converts to the display currency and sorts comparables", () => {
    const valuation = buildValuation({
      estimates: [
        estimate({
          mid: 100,
          low: 80,
          high: 140,
          comparables: [
            { title: "Active", price: 120, currency: "USD", url: null, date: null, kind: "active", source: "eBay" },
            { title: "Old sale", price: 90, currency: "USD", url: null, date: "2026-01-01", kind: "sold", source: "eBay" },
            { title: "New sale", price: 1000, currency: "SEK", url: "https://example.com", date: "2026-10-01", kind: "sold", source: "Tradera" },
          ],
        }),
      ],
      identification: chromeRookie!.identification,
      condition: chromeRookie!.condition,
      currency: "SEK",
      rates: FALLBACK_RATES,
      gradingCostUsd: 40,
      now: new Date("2026-11-07T12:00:00Z"),
    });
    expect(valuation.currency).toBe("SEK");
    expect(valuation.mid).toBe(990);
    expect(valuation.low).toBe(792);
    expect(valuation.high).toBe(1390);
    expect(valuation.comparables.map((c) => c.title)).toEqual(["New sale", "Old sale", "Active"]);
    expect(valuation.comparables[0]!.converted).toBe(1000);
    expect(valuation.comparables[1]!.converted).toBe(891);
    expect(valuation.gradingAdvice.cost).toBe(396);
    expect(valuation.sources[0]!.weight).toBe(1);
    expect(valuation.generatedAt).toBe("2026-11-07T12:00:00.000Z");
    expect(valuation.disclaimer).toMatch(/uppskattning/);
  });
});
