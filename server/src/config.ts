import type { DisplayCurrency } from "@kort/shared";
import { DISPLAY_CURRENCIES } from "@kort/shared";

export interface Config {
  port: number;
  host: string;
  /** "demo" uses fictional sample cards and the rule based valuation only. */
  mode: "live" | "demo";
  claudeModel: string;
  /** Let Claude search the web for recent sales (costs more, much better prices). */
  webResearch: boolean;
  ebay: { clientId: string; clientSecret: string; marketplace: string } | null;
  accessToken: string | null;
  rateLimit: { max: number; timeWindow: string };
  gradingCostSek: number;
  defaultCurrency: DisplayCurrency;
  fxUrl: string | null;
  demoLatencyMs: number;
  webDist: string | null;
  logLevel: string;
}

function bool(value: string | undefined): boolean | undefined {
  if (value == null || value === "") return undefined;
  return /^(1|true|yes|on)$/i.test(value);
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value != null && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, webDist: string | null = null): Config {
  const hasAnthropicCredentials = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const forcedDemo = bool(env.DEMO_MODE);
  const mode = forcedDemo === true || (forcedDemo === undefined && !hasAnthropicCredentials) ? "demo" : "live";

  const currency = (env.DEFAULT_CURRENCY ?? "SEK").toUpperCase();

  return {
    port: num(env.PORT, 8787),
    host: env.HOST ?? "0.0.0.0",
    mode,
    claudeModel: env.CLAUDE_MODEL || "claude-opus-5-5",
    webResearch: mode === "live" && (env.PRICE_RESEARCH ?? "web").toLowerCase() !== "off",
    ebay:
      env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET
        ? {
            clientId: env.EBAY_CLIENT_ID,
            clientSecret: env.EBAY_CLIENT_SECRET,
            marketplace: env.EBAY_MARKETPLACE || "EBAY_US",
          }
        : null,
    accessToken: env.APP_ACCESS_TOKEN || null,
    rateLimit: {
      max: num(env.RATE_LIMIT_MAX, 30),
      timeWindow: env.RATE_LIMIT_WINDOW || "10 minutes",
    },
    gradingCostSek: num(env.GRADING_COST_SEK, 350),
    defaultCurrency: (DISPLAY_CURRENCIES as readonly string[]).includes(currency) ? (currency as DisplayCurrency) : "SEK",
    fxUrl: env.FX_URL === "off" ? null : env.FX_URL || "https://api.frankfurter.dev/v1/latest?base=USD",
    demoLatencyMs: num(env.DEMO_LATENCY_MS, 800),
    webDist: env.WEB_DIST || webDist,
    logLevel: env.LOG_LEVEL || "info",
  };
}
