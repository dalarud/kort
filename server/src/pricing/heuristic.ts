import { heuristicEstimate, type ProviderEstimate } from "@kort/shared";
import type { PriceContext, PriceProvider } from "./types";

export class HeuristicProvider implements PriceProvider {
  readonly id = "heuristic" as const;
  readonly timeoutMs = 1000;

  async estimate({ identification, condition }: PriceContext): Promise<ProviderEstimate> {
    return heuristicEstimate(identification, condition);
  }
}
