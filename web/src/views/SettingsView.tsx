import { useState } from "react";
import { DISPLAY_CURRENCIES, type DisplayCurrency, type HealthResponse } from "@kort/shared";
import { clearCards } from "../lib/storage";
import type { Settings } from "../types";

const CURRENCY_LABEL: Record<DisplayCurrency, string> = {
  SEK: "Svenska kronor (SEK)",
  EUR: "Euro (EUR)",
  USD: "US-dollar (USD)",
  NOK: "Norska kronor (NOK)",
  DKK: "Danska kronor (DKK)",
  GBP: "Brittiska pund (GBP)",
};

const PROVIDER_LABEL: Record<string, string> = {
  web_research: "Webbsökning efter sålda kort (Claude)",
  ebay_active: "eBay – aktiva annonser",
  heuristic: "Regelmotor (riktvärde)",
};

interface Props {
  settings: Settings;
  health: HealthResponse | null;
  healthError: string | null;
  onChange: (settings: Settings) => void;
}

export function SettingsView({ settings, health, healthError, onChange }: Props) {
  const [token, setToken] = useState(settings.accessToken);
  const [message, setMessage] = useState<string | null>(null);

  const clear = async () => {
    if (!window.confirm("Ta bort alla sparade kort? Det går inte att ångra.")) return;
    await clearCards();
    setMessage("Samlingen är rensad.");
  };

  return (
    <div className="settings">
      <section className="panel">
        <h3>Valuta</h3>
        <label className="field">
          <span>Visa värden i</span>
          <select
            value={settings.currency}
            onChange={(e) => onChange({ ...settings, currency: e.target.value as DisplayCurrency })}
          >
            {DISPLAY_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABEL[code]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h3>Server</h3>
        {healthError ? (
          <p className="banner banner-error">{healthError}</p>
        ) : health ? (
          <dl className="details">
            <div>
              <dt>Läge</dt>
              <dd>{health.mode === "live" ? "Live (AI-identifiering)" : "Demo (påhittade kort)"}</dd>
            </div>
            {health.model && (
              <div>
                <dt>AI-modell</dt>
                <dd>{health.model}</dd>
              </div>
            )}
            <div>
              <dt>Priskällor</dt>
              <dd>{health.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{health.version}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Hämtar status…</p>
        )}

        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ ...settings, accessToken: token.trim() });
            setMessage("Åtkomstnyckeln är sparad.");
          }}
        >
          <label className="field">
            <span>Åtkomstnyckel {health?.requiresToken ? "(krävs av servern)" : "(behövs inte)"}</span>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Ange nyckeln från den som driftar servern"
            />
          </label>
          <button className="button secondary" type="submit">
            Spara nyckel
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>Samling</h3>
        <p className="muted small">Korten sparas bara lokalt på den här enheten, i webbläsaren.</p>
        <button className="button danger" type="button" onClick={clear}>
          Rensa samlingen
        </button>
      </section>

      {message && (
        <p className="banner banner-success" role="status">
          {message}
        </p>
      )}

      <section className="panel">
        <h3>Om Kortkollen</h3>
        <p className="small">
          Kortkollen identifierar fotbollskort med AI-bildanalys och uppskattar värdet utifrån faktiska försäljningar,
          annonser och en regelmotor. Bilderna skickas till servern för analys men sparas inte där.
        </p>
        <p className="small muted">
          Värderingar är uppskattningar och kan avvika från verkliga försäljningspriser. Kontrollera alltid jämförbara
          försäljningar innan du köper eller säljer.
        </p>
        <p className="small">
          <strong>Tips för bra bilder:</strong> mörkt och plant underlag, jämnt dagsljus, inga reflexer, fyll ramen, fota
          baksidan för säkrare identifiering.
        </p>
      </section>
    </div>
  );
}
