import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@kort/shared";
import type { Settings } from "../types";

const KEY = "kortkollen.settings.v1";

export const DEFAULT_SETTINGS: Settings = { currency: "SEK", accessToken: "" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      currency: (DISPLAY_CURRENCIES as readonly string[]).includes(parsed.currency ?? "")
        ? (parsed.currency as DisplayCurrency)
        : DEFAULT_SETTINGS.currency,
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode / storage disabled – settings simply won't persist.
  }
}
