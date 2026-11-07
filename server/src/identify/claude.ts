import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CardAnalysisSchema, normalizeCondition, normalizeIdentification, type CardAnalysis } from "@kort/shared";
import { AppError, Errors } from "../errors";
import { IDENTIFY_SYSTEM_PROMPT, IDENTIFY_USER_PROMPT } from "./prompts";
import type { CardIdentifier, CardImages } from "./types";

/** Server-side fallback when a request is declined by a safety classifier. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Translates Anthropic SDK errors into user-facing AppErrors. */
export function mapAnthropicError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.RateLimitError) return Errors.aiBusy();
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AppError("AI_AUTH", 503, "Servern saknar giltig API-nyckel för AI-tjänsten.");
  }
  if (error instanceof Anthropic.APIConnectionError) return Errors.aiUnavailable();
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529 || (error.status ?? 0) >= 500) return Errors.aiBusy();
    return Errors.aiInvalidResponse();
  }
  return error;
}

export class ClaudeCardIdentifier implements CardIdentifier {
  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
  ) {}

  async identify(images: CardImages): Promise<CardAnalysis> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: "text", text: "Framsida:" },
      { type: "image", source: { type: "base64", media_type: images.front.mediaType, data: images.front.base64 } },
    ];
    if (images.back) {
      content.push(
        { type: "text", text: "Baksida:" },
        { type: "image", source: { type: "base64", media_type: images.back.mediaType, data: images.back.base64 } },
      );
    }
    content.push({ type: "text", text: IDENTIFY_USER_PROMPT });

    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: betaZodOutputFormat(CardAnalysisSchema) },
        system: IDENTIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      const mapped = mapAnthropicError(error);
      if (mapped === error && !(error instanceof AppError)) throw Errors.aiInvalidResponse();
      throw mapped;
    }

    if (response.stop_reason === "refusal") throw Errors.aiRefused();
    if (response.stop_reason === "max_tokens") throw Errors.aiInvalidResponse();

    const parsed = response.parsed_output;
    if (!parsed) throw Errors.aiInvalidResponse();

    return {
      identification: normalizeIdentification(parsed.identification),
      condition: normalizeCondition(parsed.condition),
    };
  }
}
