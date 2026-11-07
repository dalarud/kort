import type {
  ApiErrorBody,
  CardIdentification,
  ConditionAssessment,
  DisplayCurrency,
  HealthResponse,
  Rates,
  ScanResponse,
  ValuateResponse,
} from "@kort/shared";
import { loadSettings } from "./lib/settings";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken } = loadSettings();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("x-app-token", accessToken);

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("NETWORK", "Ingen kontakt med servern. Kontrollera uppkopplingen och försök igen.", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. proxy error page).
  }
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? `Servern svarade med fel (${response.status}).`,
      response.status,
    );
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  rates: () => request<Rates>("/api/rates"),
  scan: (front: string, back: string | null, currency: DisplayCurrency) =>
    request<ScanResponse>("/api/scan", { method: "POST", body: JSON.stringify({ front, back, currency }) }),
  valuate: (identification: CardIdentification, condition: ConditionAssessment, currency: DisplayCurrency) =>
    request<ValuateResponse>("/api/valuate", {
      method: "POST",
      body: JSON.stringify({ identification, condition, currency }),
    }),
};
