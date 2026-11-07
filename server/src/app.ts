import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  normalizeCondition,
  normalizeIdentification,
  ScanRequestSchema,
  ValuateRequestSchema,
  type ApiErrorBody,
  type HealthResponse,
  type ScanResponse,
  type ValuateResponse,
} from "@kort/shared";
import { ZodError } from "zod";
import type { Config } from "./config";
import { AppError, Errors } from "./errors";
import type { FxSource } from "./fx";
import type { CardIdentifier } from "./identify/types";
import { decodeImage } from "./images";
import type { ValuationService } from "./pricing/service";

export const APP_VERSION = "1.0.0";
const BODY_LIMIT = 12 * 1024 * 1024;

export interface AppDeps {
  config: Config;
  identifier: CardIdentifier;
  valuation: ValuationService;
  fx: FxSource;
  logger?: FastifyServerOptions["logger"];
}

function tokenMatches(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: BODY_LIMIT, trustProxy: true });

  await app.register(rateLimit, { global: false });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  });

  app.addHook("onRequest", async (request) => {
    if (!config.accessToken) return;
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/health")) return;
    const header = request.headers["x-app-token"];
    if (!tokenMatches(config.accessToken, Array.isArray(header) ? header[0] : header)) throw Errors.unauthorized();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message));
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(errorBody("INVALID_INPUT", "Ogiltig förfrågan."));
    }
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.statusCode === 429) {
      return reply.status(429).send(errorBody("RATE_LIMITED", "För många förfrågningar. Vänta en stund och försök igen."));
    }
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE" || err.statusCode === 413) {
      return reply.status(413).send(errorBody("IMAGE_TOO_LARGE", "Bilderna är för stora."));
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send(errorBody("BAD_REQUEST", "Ogiltig förfrågan."));
    }
    request.log.error(error);
    return reply.status(500).send(errorBody("INTERNAL", "Något gick fel på servern. Försök igen."));
  });

  const limited = { config: { rateLimit: config.rateLimit } };

  app.get("/api/health", async (): Promise<HealthResponse> => ({
    ok: true,
    mode: config.mode,
    model: config.mode === "live" ? config.claudeModel : null,
    providers: deps.valuation.providerIds,
    requiresToken: Boolean(config.accessToken),
    version: APP_VERSION,
  }));

  app.get("/api/rates", async () => deps.fx.getRates());

  app.post("/api/scan", limited, async (request): Promise<ScanResponse> => {
    const body = ScanRequestSchema.parse(request.body);
    const images = { front: decodeImage(body.front), back: body.back ? decodeImage(body.back) : null };
    const analysis = await deps.identifier.identify(images);
    if (!analysis.identification.isCard) throw Errors.notACard(analysis.identification.notes || undefined);

    const valuation = await deps.valuation.valuate(
      analysis.identification,
      analysis.condition,
      body.currency ?? config.defaultCurrency,
    );
    request.log.info(
      { player: analysis.identification.player, set: analysis.identification.set, mid: valuation.mid },
      "kort värderat",
    );
    return { id: randomUUID(), mode: config.mode, ...analysis, valuation };
  });

  app.post("/api/valuate", limited, async (request): Promise<ValuateResponse> => {
    const body = ValuateRequestSchema.parse(request.body);
    const identification = normalizeIdentification(body.identification);
    const condition = normalizeCondition(body.condition);
    const valuation = await deps.valuation.valuate(identification, condition, body.currency ?? config.defaultCurrency);
    return { mode: config.mode, identification, condition, valuation };
  });

  const webDist = config.webDist;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      setHeaders(res, filePath) {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.header("Cache-Control", "no-cache");
        }
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if ((request.method === "GET" || request.method === "HEAD") && !request.url.startsWith("/api/")) {
        return reply.header("Cache-Control", "no-cache").sendFile("index.html");
      }
      return reply.status(404).send(errorBody("NOT_FOUND", "Hittades inte."));
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.status(404).send(errorBody("NOT_FOUND", "Hittades inte.")));
  }

  return app;
}
