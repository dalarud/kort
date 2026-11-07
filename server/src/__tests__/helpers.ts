import { FALLBACK_RATES, SAMPLE_ANALYSES, type CardAnalysis } from "@kort/shared";
import { loadConfig, type Config } from "../config";
import type { CardIdentifier } from "../identify/types";
import { HeuristicProvider } from "../pricing/heuristic";
import { ValuationService } from "../pricing/service";
import type { PriceProvider } from "../pricing/types";
import { buildApp } from "../app";

/** A tiny but valid-looking JPEG payload (magic bytes + padding). */
export function fakeJpeg(seed = 0): string {
  const bytes = Buffer.alloc(256, seed);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

export const fakeFx = { getRates: async () => FALLBACK_RATES };

export class FixedIdentifier implements CardIdentifier {
  calls = 0;
  constructor(public analysis: CardAnalysis = JSON.parse(JSON.stringify(SAMPLE_ANALYSES[0]))) {}
  async identify(): Promise<CardAnalysis> {
    this.calls++;
    return this.analysis;
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({ DEMO_MODE: "true", FX_URL: "off" }), demoLatencyMs: 0, webDist: null, ...overrides };
}

export async function testApp(
  options: { config?: Partial<Config>; identifier?: CardIdentifier; providers?: PriceProvider[] } = {},
) {
  const identifier = options.identifier ?? new FixedIdentifier();
  const valuation = new ValuationService(options.providers ?? [new HeuristicProvider()], fakeFx, { gradingCostSek: 350 });
  const app = await buildApp({ config: testConfig(options.config), identifier, valuation, fx: fakeFx });
  return { app, identifier };
}
