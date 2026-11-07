import { useState } from "react";
import { describeCard, type CardIdentification, type ConditionAssessment, type DisplayCurrency } from "@kort/shared";
import { api, ApiError } from "../api";
import { Icon } from "../components/Icon";
import { IdentificationEditor } from "../components/IdentificationEditor";
import { ConditionPanel, DetailsPanel, GradingPanel, ValuePanel } from "../components/Panels";
import type { CardEntry } from "../types";

interface Props {
  entry: CardEntry;
  currency: DisplayCurrency;
  onChange: (entry: CardEntry) => void;
  onSave: (entry: CardEntry) => Promise<void>;
  onDelete: (entry: CardEntry) => Promise<void>;
  onScanNext: () => void;
  onBack?: () => void;
}

export function ResultView({ entry, currency, onChange, onSave, onDelete, onScanNext, onBack }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "valuate" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const { identification: card } = entry;
  const { title, subtitle } = describeCard(card);

  const revalue = async (identification: CardIdentification, condition: ConditionAssessment) => {
    setBusy("valuate");
    setError(null);
    try {
      const result = await api.valuate(identification, condition, currency);
      const updated: CardEntry = {
        ...entry,
        identification: result.identification,
        condition: result.condition,
        valuation: result.valuation,
        mode: result.mode,
        updatedAt: new Date().toISOString(),
      };
      onChange(updated);
      if (entry.saved) await onSave(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Värderingen misslyckades. Försök igen.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      await onSave(entry);
    } catch {
      setError("Kortet kunde inte sparas på enheten.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Ta bort ${title} från samlingen?`)) return;
    await onDelete(entry);
  };

  const badges = [
    card.isRookie && "RC",
    card.isAutograph && "Autograf",
    card.isMemorabilia && "Tröjbit",
    card.serialNumber && `#${card.serialNumber}`,
    card.parallel,
    card.grading.isGraded && `${card.grading.company ?? ""} ${card.grading.grade ?? ""}`.trim(),
  ].filter(Boolean) as string[];

  return (
    <div className="result">
      {onBack && (
        <button className="link-button back" type="button" onClick={onBack}>
          <Icon name="back" size={18} /> Samlingen
        </button>
      )}

      <header className="result-head">
        <button
          className="result-image"
          type="button"
          onClick={() => entry.backImage && setShowBack((s) => !s)}
          aria-label={entry.backImage ? "Visa andra sidan" : "Kortbild"}
        >
          <img src={showBack && entry.backImage ? entry.backImage : entry.image} alt={`Kort: ${title}`} />
          {entry.backImage && <span className="flip-hint">{showBack ? "Baksida" : "Framsida"} · tryck för att vända</span>}
        </button>
        <div className="result-title">
          <h2 data-testid="card-title">{title}</h2>
          <p className="muted">{subtitle}</p>
          {card.team && <p className="muted small">{card.team}</p>}
          <div className="badges">
            {badges.map((badge) => (
              <span key={badge} className="badge">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <div className="button-row sticky-actions">
        {entry.saved ? (
          <>
            <button className="button secondary" type="button" onClick={() => revalue(card, entry.condition)} disabled={busy !== null}>
              <Icon name="refresh" size={18} /> {busy === "valuate" ? "Uppdaterar…" : "Uppdatera värde"}
            </button>
            <button className="button danger" type="button" onClick={remove} disabled={busy !== null}>
              <Icon name="trash" size={18} /> Ta bort
            </button>
          </>
        ) : (
          <>
            <button className="button" type="button" onClick={save} disabled={busy !== null}>
              <Icon name="check" size={18} /> {busy === "save" ? "Sparar…" : "Spara i samlingen"}
            </button>
            <button className="button secondary" type="button" onClick={onScanNext} disabled={busy !== null}>
              <Icon name="camera" size={18} /> Skanna nästa
            </button>
          </>
        )}
      </div>

      <ValuePanel valuation={entry.valuation} demo={entry.mode === "demo"} />

      {editing ? (
        <IdentificationEditor
          identification={card}
          condition={entry.condition}
          busy={busy === "valuate"}
          onSubmit={revalue}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <DetailsPanel card={card} onEdit={() => setEditing(true)} />
      )}

      <GradingPanel valuation={entry.valuation} />
      <ConditionPanel condition={entry.condition} graded={card.grading.isGraded} />
    </div>
  );
}
