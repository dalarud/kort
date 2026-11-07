import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE_ANALYSES, type ScanResponse, type ValuateResponse } from "@kort/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Errors } from "../errors";
import type { CardIdentifier } from "../identify/types";
import { fakeJpeg, FixedIdentifier, testApp } from "./helpers";

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

describe("GET /api/health", () => {
  it("reports mode and providers", async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, mode: "demo", providers: ["heuristic"], requiresToken: false });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("POST /api/scan", () => {
  it("identifies and values a card", async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg(), currency: "SEK" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<ScanResponse>();
    expect(body.id).toMatch(/[0-9a-f-]{36}/);
    expect(body.identification.player).toBe(SAMPLE_ANALYSES[0]!.identification.player);
    expect(body.valuation.currency).toBe("SEK");
    expect(body.valuation.mid).toBeGreaterThan(0);
    expect(body.valuation.sources[0]!.provider).toBe("heuristic");
    expect(body.valuation.gradeScenarios.length).toBeGreaterThan(1);
  });

  it("accepts an optional back image", async () => {
    let received = 0;
    const identifier: CardIdentifier = {
      async identify(images) {
        received = images.back ? 2 : 1;
        return JSON.parse(JSON.stringify(SAMPLE_ANALYSES[1]));
      },
    };
    ({ app } = await testApp({ identifier }));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg(), back: fakeJpeg(1) } });
    expect(res.statusCode).toBe(200);
    expect(received).toBe(2);
  });

  it("uses the configured default currency", async () => {
    ({ app } = await testApp({ config: { defaultCurrency: "EUR" } }));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect(res.json<ScanResponse>().valuation.currency).toBe("EUR");
  });

  it("rejects non-images", async () => {
    ({ app } = await testApp());
    const notImage = `data:image/jpeg;base64,${Buffer.alloc(200, 65).toString("base64")}`;
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: notImage } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_IMAGE");
  });

  it("rejects invalid bodies", async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: "x" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_INPUT");
  });

  it("returns 422 when no card is found", async () => {
    const identifier = new FixedIdentifier();
    identifier.analysis.identification.isCard = false;
    identifier.analysis.identification.notes = "Bilden visar en katt.";
    ({ app } = await testApp({ identifier }));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: "NOT_A_CARD" });
    expect(res.json().error.message).toContain("katt");
  });

  it("passes identifier errors through with their status code", async () => {
    const identifier: CardIdentifier = {
      async identify() {
        throw Errors.aiBusy();
      },
    };
    ({ app } = await testApp({ identifier }));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("AI_BUSY");
  });

  it("hides unexpected errors", async () => {
    const identifier: CardIdentifier = {
      async identify() {
        throw new Error("secret internal detail");
      },
    };
    ({ app } = await testApp({ identifier }));
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret");
  });

  it("rate limits scans", async () => {
    ({ app } = await testApp({ config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }));
    const scan = () => app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect((await scan()).statusCode).toBe(200);
    expect((await scan()).statusCode).toBe(200);
    const third = await scan();
    expect(third.statusCode).toBe(429);
    expect(third.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("access token", () => {
  it("protects the API but not health", async () => {
    ({ app } = await testApp({ config: { accessToken: "hemlig" } }));
    expect((await app.inject({ method: "GET", url: "/api/health" })).json().requiresToken).toBe(true);

    const denied = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() } });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().error.code).toBe("UNAUTHORIZED");

    const wrong = await app.inject({ method: "GET", url: "/api/rates", headers: { "x-app-token": "fel" } });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({ method: "POST", url: "/api/scan", payload: { front: fakeJpeg() }, headers: { "x-app-token": "hemlig" } });
    expect(ok.statusCode).toBe(200);
  });
});

describe("POST /api/valuate", () => {
  it("re-values a corrected identification", async () => {
    ({ app } = await testApp());
    const sample = JSON.parse(JSON.stringify(SAMPLE_ANALYSES[0]));
    const base = await app.inject({ method: "POST", url: "/api/valuate", payload: { ...sample, currency: "USD" } });
    sample.identification.isAutograph = true;
    sample.identification.serialNumber = "1/1";
    sample.identification.printRun = null;
    const better = await app.inject({ method: "POST", url: "/api/valuate", payload: { ...sample, currency: "USD" } });
    expect(base.statusCode).toBe(200);
    expect(better.statusCode).toBe(200);
    const baseValue = base.json<ValuateResponse>().valuation.mid;
    const betterValue = better.json<ValuateResponse>().valuation.mid;
    expect(betterValue).toBeGreaterThan(baseValue * 50);
    expect(better.json<ValuateResponse>().valuation.sources[0]!.note).toContain("/1");
    expect(better.json<ValuateResponse>().identification.printRun).toBe(1);
  });

  it("validates input", async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: "POST", url: "/api/valuate", payload: { identification: {} } });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/rates", () => {
  it("returns rates", async () => {
    ({ app } = await testApp());
    const res = await app.inject({ method: "GET", url: "/api/rates" });
    expect(res.json()).toMatchObject({ base: "USD", rates: { SEK: expect.any(Number) } });
  });
});

describe("static web app", () => {
  it("serves the SPA with history fallback and keeps API 404s as JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kort-web-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Kortkollen</title>");
    ({ app } = await testApp({ config: { webDist: dir } }));

    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain("Kortkollen");

    const deep = await app.inject({ method: "GET", url: "/samling" });
    expect(deep.statusCode).toBe(200);
    expect(deep.body).toContain("Kortkollen");
    expect(deep.headers["cache-control"]).toBe("no-cache");

    const api = await app.inject({ method: "GET", url: "/api/finns-inte" });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe("NOT_FOUND");
  });
});
