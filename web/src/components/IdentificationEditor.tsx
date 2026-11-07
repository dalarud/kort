import { useState, type FormEvent } from "react";
import {
  CARD_TYPES,
  POPULARITY_LEVELS,
  type CardIdentification,
  type CardType,
  type ConditionAssessment,
  type PlayerPopularity,
} from "@kort/shared";

interface Props {
  identification: CardIdentification;
  condition: ConditionAssessment;
  busy: boolean;
  onSubmit: (identification: CardIdentification, condition: ConditionAssessment) => void;
  onCancel: () => void;
}

const TEXT_FIELDS: Array<[keyof CardIdentification, string, string]> = [
  ["player", "Spelare", "t.ex. Zlatan Ibrahimović"],
  ["team", "Lag", "t.ex. Malmö FF"],
  ["season", "Säsong / år", "t.ex. 2020-21"],
  ["manufacturer", "Tillverkare", "t.ex. Panini"],
  ["set", "Serie", "t.ex. Prizm Premier League"],
  ["cardNumber", "Kortnummer", "t.ex. 198"],
  ["parallel", "Parallell", "t.ex. Silver Prizm"],
  ["serialNumber", "Numrering", "t.ex. 23/99"],
  ["insert", "Insert", ""],
];

const TYPE_LABEL: Record<CardType, string> = {
  trading_card: "Samlarkort",
  sticker: "Klistermärke",
  game_card: "Spelkort (Adrenalyn, Match Attax …)",
  other: "Övrigt",
};

const POPULARITY_LABEL: Record<PlayerPopularity, string> = {
  legend: "Legendar",
  superstar: "Superstjärna",
  star: "Stjärna",
  regular: "Ordinarie spelare",
  unknown: "Vet ej",
};

export function IdentificationEditor({ identification, condition, busy, onSubmit, onCancel }: Props) {
  const [card, setCard] = useState<CardIdentification>(identification);
  const [overall, setOverall] = useState(condition.overall);

  const setText = (key: keyof CardIdentification, value: string) =>
    setCard((c) => ({ ...c, [key]: value.trim() === "" ? null : value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(
      // A user-corrected card is as certain as it gets; let the server rebuild the search query.
      { ...card, printRun: null, searchQuery: "", confidence: 1 },
      { ...condition, overall },
    );
  };

  return (
    <form className="panel editor" onSubmit={submit}>
      <h3>Rätta identifieringen</h3>
      <p className="muted small">Ändra det som blev fel och värdera om kortet.</p>
      {TEXT_FIELDS.map(([key, label, placeholder]) => (
        <label key={key} className="field">
          <span>{label}</span>
          <input
            type="text"
            value={(card[key] as string | null) ?? ""}
            placeholder={placeholder}
            onChange={(e) => setText(key, e.target.value)}
          />
        </label>
      ))}

      <label className="field">
        <span>Typ av kort</span>
        <select value={card.cardType} onChange={(e) => setCard((c) => ({ ...c, cardType: e.target.value as CardType }))}>
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Spelarens popularitet</span>
        <select
          value={card.playerPopularity}
          onChange={(e) => setCard((c) => ({ ...c, playerPopularity: e.target.value as PlayerPopularity }))}
        >
          {POPULARITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {POPULARITY_LABEL[level]}
            </option>
          ))}
        </select>
      </label>

      <div className="checks">
        {(
          [
            ["isRookie", "Rookie"],
            ["isAutograph", "Autograf"],
            ["isMemorabilia", "Tröjbit/patch"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="check">
            <input type="checkbox" checked={card[key]} onChange={(e) => setCard((c) => ({ ...c, [key]: e.target.checked }))} />
            {label}
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={card.grading.isGraded}
            onChange={(e) =>
              setCard((c) => ({
                ...c,
                grading: { ...c.grading, isGraded: e.target.checked, company: c.grading.company ?? "PSA", grade: c.grading.grade ?? 9 },
              }))
            }
          />
          Graderat
        </label>
      </div>

      {card.grading.isGraded ? (
        <div className="field-row">
          <label className="field">
            <span>Företag</span>
            <select
              value={card.grading.company ?? "PSA"}
              onChange={(e) => setCard((c) => ({ ...c, grading: { ...c.grading, company: e.target.value } }))}
            >
              {["PSA", "BGS", "SGC", "CGC"].map((company) => (
                <option key={company}>{company}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Betyg</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={card.grading.grade ?? 9}
              onChange={(e) => setCard((c) => ({ ...c, grading: { ...c.grading, grade: Number(e.target.value) } }))}
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Skick (1–10): {overall.toLocaleString("sv-SE")}</span>
          <input type="range" min={1} max={10} step={0.5} value={overall} onChange={(e) => setOverall(Number(e.target.value))} />
        </label>
      )}

      <div className="button-row">
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Värderar…" : "Värdera om"}
        </button>
        <button className="button secondary" type="button" onClick={onCancel} disabled={busy}>
          Avbryt
        </button>
      </div>
    </form>
  );
}
