import { createHash } from "node:crypto";
import { SAMPLE_ANALYSES, type CardAnalysis } from "@kort/shared";
import type { CardIdentifier, CardImages } from "./types";

/**
 * Used when no Anthropic credentials are configured. Picks one of the fictional
 * sample cards deterministically from the image bytes, so the full flow can be
 * tried (and tested) without any API costs.
 */
export class DemoCardIdentifier implements CardIdentifier {
  constructor(private readonly latencyMs = 800) {}

  async identify(images: CardImages): Promise<CardAnalysis> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const digest = createHash("sha256").update(images.front.base64).digest();
    const sample = SAMPLE_ANALYSES[digest[0]! % SAMPLE_ANALYSES.length]!;
    return structuredClone(sample);
  }
}
