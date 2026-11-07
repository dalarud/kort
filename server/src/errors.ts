/** An error with a stable code and a Swedish, user-facing message. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  invalidImage: (detail = "Bilden kunde inte läsas. Använd JPEG, PNG eller WebP.") => new AppError("INVALID_IMAGE", 400, detail),
  imageTooLarge: () => new AppError("IMAGE_TOO_LARGE", 413, "Bilden är för stor (max 8 MB)."),
  notACard: (notes?: string) =>
    new AppError("NOT_A_CARD", 422, `Hittade inget kort i bilden. Lägg kortet inom ramen och försök igen.${notes ? ` (${notes})` : ""}`),
  unauthorized: () => new AppError("UNAUTHORIZED", 401, "Fel eller saknad åtkomstnyckel. Ange nyckeln under Inställningar."),
  aiRefused: () => new AppError("AI_REFUSED", 422, "Bilden kunde inte analyseras. Prova en annan bild."),
  aiInvalidResponse: () => new AppError("AI_INVALID_RESPONSE", 502, "AI-tjänsten gav ett oväntat svar. Försök igen."),
  aiUnavailable: () => new AppError("AI_UNAVAILABLE", 503, "AI-tjänsten är inte tillgänglig just nu. Försök igen om en stund."),
  aiBusy: () => new AppError("AI_BUSY", 503, "AI-tjänsten är överbelastad. Vänta en stund och försök igen."),
};
