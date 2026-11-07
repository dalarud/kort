import { FALLBACK_RATES, SAMPLE_ANALYSES, type Valuation } from "@kort/shared";
import { describe, expect, it } from "vitest";
import type { CardEntry } from "../types";
import { CARD_RATIO, fitGuide, fitWithin, viewRectToSource } from "./crop";
import { cardsToCsv, toCsv } from "./csv";
import { assessQuality, laplacianVariance, toGray } from "./imageQuality";

function image(width: number, height: number, pixel: (x: number, y: number) => number): number[] {
  const data: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = pixel(x, y);
    data.push(v, v, v, 255);
  }
  return data;
}

describe("crop", () => {
  it("fits a portrait card guide inside a tall view", () => {
    const guide = fitGuide(400, 800, "portrait", 0.1);
    expect(guide.width).toBeCloseTo(320);
    expect(guide.width / guide.height).toBeCloseTo(CARD_RATIO);
    expect(guide.x).toBeCloseTo(40);
    expect(guide.y + guide.height / 2).toBeCloseTo(400);
  });

  it("is height-limited in wide views and supports landscape", () => {
    const portrait = fitGuide(1000, 500, "portrait", 0);
    expect(portrait.height).toBeCloseTo(500);
    const landscape = fitGuide(1000, 500, "landscape", 0);
    expect(landscape.width / landscape.height).toBeCloseTo(1 / CARD_RATIO);
  });

  it("maps view coordinates to video pixels with object-fit cover", () => {
    // 1920×1080 video in a 360×640 portrait view: scale = 640/1080, video is cropped left/right.
    const scale = 640 / 1080;
    const rect = viewRectToSource({ x: 30, y: 100, width: 300, height: 419 }, 360, 640, 1920, 1080);
    const offsetX = (360 - 1920 * scale) / 2;
    expect(rect.x).toBeCloseTo((30 - offsetX) / scale);
    expect(rect.y).toBeCloseTo(100 / scale);
    expect(rect.width).toBeCloseTo(300 / scale);
    expect(rect.height).toBeCloseTo(419 / scale);
  });

  it("clamps to the video bounds", () => {
    const rect = viewRectToSource({ x: -50, y: -50, width: 1000, height: 1000 }, 100, 100, 100, 100);
    expect(rect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("scales down but never up", () => {
    expect(fitWithin(3000, 4000, 1568)).toEqual({ width: 1176, height: 1568 });
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600 });
  });
});

describe("image quality", () => {
  it("measures sharpness", () => {
    const flat = toGray(image(20, 20, () => 128), 20, 20);
    const checker = toGray(image(20, 20, (x, y) => ((x + y) % 2 ? 255 : 0)), 20, 20);
    expect(laplacianVariance(flat, 20, 20)).toBe(0);
    expect(laplacianVariance(checker, 20, 20)).toBeGreaterThan(1000);
  });

  it("classifies frames", () => {
    const stripes = (base: number, amp: number) => image(40, 40, (x) => base + (x % 4 < 2 ? amp : -amp));
    expect(assessQuality(stripes(20, 10), 40, 40).verdict).toBe("dark");
    expect(assessQuality(image(40, 40, (x, y) => (y < 10 ? 255 : 120 + (x % 2) * 40)), 40, 40).verdict).toBe("glare");
    expect(assessQuality(image(40, 40, () => 130), 40, 40).verdict).toBe("blurry");
    const ok = assessQuality(stripes(128, 60), 40, 40);
    expect(ok.verdict).toBe("ok");
    expect(ok.message).toMatch(/ta bilden/);
  });
});

describe("csv", () => {
  it("escapes cells", () => {
    expect(toCsv([["a;b", 'sa "hej"', null, 3]])).toBe('"a;b";"sa ""hej""";;3');
  });

  it("exports cards for Swedish Excel", () => {
    const sample = JSON.parse(JSON.stringify(SAMPLE_ANALYSES[0]));
    const valuation = { currency: "SEK", low: 100, mid: 150.5, high: 200, confidenceLabel: "medel", generatedAt: "2026-11-07T10:00:00Z" } as Valuation;
    const card = { ...sample, valuation, createdAt: "2026-11-07T10:00:00Z" } as CardEntry;
    const csv = cardsToCsv([card], "SEK", FALLBACK_RATES);
    expect(csv.startsWith("﻿Spelare;")).toBe(true);
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain("Erik Lindvall (DEMO)");
    expect(row).toContain("23/50");
    expect(row).toContain(";Ja;Nej;Nej;");
    expect(row).toContain("150,50");

    const inEur = cardsToCsv([card], "EUR", FALLBACK_RATES).split("\r\n")[1]!;
    expect(inEur).toContain(((150.5 / 9.9) * 0.9).toFixed(2).replace(".", ","));
  });
});
