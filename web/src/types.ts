import type { AppMode, CardIdentification, ConditionAssessment, DisplayCurrency, Valuation } from "@kort/shared";

export interface CardEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** JPEG data URL of the front */
  image: string;
  backImage: string | null;
  thumbnail: string | null;
  identification: CardIdentification;
  condition: ConditionAssessment;
  valuation: Valuation;
  mode: AppMode;
  saved: boolean;
}

export interface Settings {
  currency: DisplayCurrency;
  accessToken: string;
}
