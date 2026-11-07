import type { CardIdentification, ConditionAssessment, ProviderEstimate, ProviderId, Rates } from "@kort/shared";

export interface PriceContext {
  identification: CardIdentification;
  condition: ConditionAssessment;
  rates: Rates;
}

export interface PriceProvider {
  readonly id: ProviderId;
  /** Max time to wait for this provider before giving up on it. */
  readonly timeoutMs: number;
  /** Returns null when the provider has no usable data for this card. */
  estimate(context: PriceContext): Promise<ProviderEstimate | null>;
}
