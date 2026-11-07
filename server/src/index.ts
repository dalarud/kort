import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { FxService } from "./fx";
import { ClaudeCardIdentifier } from "./identify/claude";
import { DemoCardIdentifier } from "./identify/demo";
import type { CardIdentifier } from "./identify/types";
import { EbayBrowseProvider } from "./pricing/ebay";
import { HeuristicProvider } from "./pricing/heuristic";
import { ValuationService } from "./pricing/service";
import type { PriceProvider } from "./pricing/types";
import { WebResearchProvider } from "./pricing/webResearch";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

for (const file of [resolve(repoRoot, ".env"), resolve(repoRoot, "server/.env")]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const webDist = resolve(repoRoot, "web/dist");
const config = loadConfig(process.env, existsSync(webDist) ? webDist : null);

const logger = { level: config.logLevel };
const providers: PriceProvider[] = [];
let identifier: CardIdentifier;

if (config.mode === "live") {
  const client = new Anthropic({ timeout: 180_000, maxRetries: 2 });
  identifier = new ClaudeCardIdentifier(client, config.claudeModel);
  if (config.webResearch) providers.push(new WebResearchProvider(client, config.claudeModel));
} else {
  identifier = new DemoCardIdentifier(config.demoLatencyMs);
}
if (config.ebay && config.mode === "live") providers.push(new EbayBrowseProvider(config.ebay));
providers.push(new HeuristicProvider());

let warn: (msg: string) => void = (msg) => console.warn(msg);
const fx = new FxService(config.fxUrl, fetch, (msg) => warn(msg));
const valuation = new ValuationService(providers, fx, {
  gradingCostSek: config.gradingCostSek,
  log: (msg) => warn(msg),
});

const app = await buildApp({ config, identifier, valuation, fx, logger });
warn = (msg) => app.log.warn(msg);

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Kortkollen körs i ${config.mode === "live" ? `LIVE-läge (${config.claudeModel})` : "DEMO-läge (ingen API-nyckel)"}; ` +
      `prisleverantörer: ${providers.map((p) => p.id).join(", ")}`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
