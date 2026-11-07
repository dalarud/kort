import type { CardAnalysis } from "@kort/shared";
import type { DecodedImage } from "../images";

export interface CardImages {
  front: DecodedImage;
  back: DecodedImage | null;
}

export interface CardIdentifier {
  identify(images: CardImages): Promise<CardAnalysis>;
}
