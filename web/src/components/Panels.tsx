import { formatMoney, formatRange, type CardIdentification, type ConditionAssessment, type Valuation } from "@kort/shared";
import { Icon } from "./Icon";

const PROVIDER_ICON: Record<string, string> = {
  web_research: "search",
  ebay_active: "cards",
  heuristic: "info",
};

export function ValuePanel({ valuation, demo }: { valuation: Valuation; demo: boolean }) {
  const { currency } = valuation;
  return (
    <section className="panel value-panel" aria-labelledby="value-heading">
      {demo && (
        <p className="demo-badge">
          DEMO – påhittat kort och regelbaserat värde. Lägg till en API-nyckel på servern för riktiga värderingar.
        </p>
      )}
      <p className="eyebrow" id="value-heading">
        Uppskattat värde
      </p>
      <p className="value-mid" data-testid="value-mid">
        {formatMoney(valuation.mid, currency)}
      </p>
      <p className="value-range">{formatRange(valuation.low, valuation.high, currency)}</p>
      <div className="value-meta">
        <span className={`chip confidence-${valuation.confidenceLabel}`}>Säkerhet: {valuation.confidenceLabel}</span>
        <span className="muted small">
          {new Date(valuation.generatedAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>

      <h3>Källor</h3>
      <ul className="sources">
        {valuation.sources.map((source) => (
          <li key={source.provider}>
            <div className="source-head">
              <Icon name={PROVIDER_ICON[source.provider] ?? "info"} size={18} />
              <strong>{source.label}</strong>
              <span className="source-value">{formatMoney(source.mid, currency)}</span>
            </div>
            <div className="source-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, source.weight * 100)}%` }} />
            </div>
            <p className="muted small">
              Vikt {Math.round(source.weight * 100)} % · {formatRange(source.low, source.high, currency)}
            </p>
            {source.note && <p className="small">{source.note}</p>}
          </li>
        ))}
        {valuation.sources.length === 0 && <li className="muted">Inga prisuppgifter hittades.</li>}
      </ul>

      {valuation.comparables.length > 0 && (
        <>
          <h3>Jämförbara försäljningar</h3>
          <ul className="comparables">
            {valuation.comparables.map((c, i) => (
              <li key={`${c.title}-${i}`}>
                <div>
                  <span className={`chip ${c.kind === "sold" ? "chip-sold" : "chip-active"}`}>
                    {c.kind === "sold" ? "Såld" : "Till salu"}
                  </span>{" "}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer">
                      {c.title} <Icon name="external" size={12} />
                    </a>
                  ) : (
                    c.title
                  )}
                </div>
                <div className="muted small">
                  {c.source}
                  {c.date ? ` · ${c.date}` : ""} · {formatMoney(c.price, c.currency)}
                  {c.converted != null && c.currency !== currency ? ` ≈ ${formatMoney(c.converted, currency)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="disclaimer">{valuation.disclaimer}</p>
    </section>
  );
}

export function GradingPanel({ valuation }: { valuation: Valuation }) {
  const { gradingAdvice: advice, currency } = valuation;
  return (
    <section className="panel">
      <h3>Gradering</h3>
      <p className={`advice advice-${advice.verdict}`}>{advice.message}</p>
      <table className="grade-table">
        <tbody>
          {valuation.gradeScenarios.map((s) => (
            <tr key={s.label} className={s.likely ? "likely" : ""}>
              <td>
                {s.label}
                {s.likely && advice.verdict !== "already_graded" ? " (troligt)" : ""}
              </td>
              <td>{formatMoney(s.value, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {advice.verdict !== "already_graded" && (
        <p className="muted small">Räknat med graderingskostnad ca {formatMoney(advice.cost, currency)} inkl. frakt.</p>
      )}
    </section>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score">
      <span>{label}</span>
      <div className="score-track" role="meter" aria-valuemin={1} aria-valuemax={10} aria-valuenow={value} aria-label={label}>
        <span style={{ width: `${value * 10}%` }} data-level={value >= 9 ? "high" : value >= 7 ? "mid" : "low"} />
      </div>
      <strong>{value.toLocaleString("sv-SE")}</strong>
    </div>
  );
}

export function ConditionPanel({ condition, graded }: { condition: ConditionAssessment; graded: boolean }) {
  return (
    <section className="panel">
      <h3>Skick {graded ? "(enligt gradering)" : "(uppskattat från foto)"}</h3>
      <ScoreBar label="Centrering" value={condition.centering} />
      <ScoreBar label="Hörn" value={condition.corners} />
      <ScoreBar label="Kanter" value={condition.edges} />
      <ScoreBar label="Yta" value={condition.surface} />
      <div className="overall">
        Helhetsbetyg ≈ <strong>{condition.overall.toLocaleString("sv-SE")}</strong> / 10
      </div>
      {condition.summary && <p>{condition.summary}</p>}
      {condition.issues.length > 0 && (
        <ul className="issues">
          {condition.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CARD_TYPE_LABEL: Record<CardIdentification["cardType"], string> = {
  trading_card: "Samlarkort",
  sticker: "Klistermärke",
  game_card: "Spelkort",
  other: "Övrigt",
};

export function DetailsPanel({ card, onEdit }: { card: CardIdentification; onEdit?: () => void }) {
  const rows: Array<[string, string | null]> = [
    ["Spelare", card.player],
    ["Lag", card.team],
    ["Säsong", card.season],
    ["Tillverkare", card.manufacturer],
    ["Serie", card.set],
    ["Kortnummer", card.cardNumber],
    ["Parallell", card.parallel],
    ["Numrering", card.serialNumber],
    ["Insert", card.insert],
    ["Typ", CARD_TYPE_LABEL[card.cardType]],
    ["Gradering", card.grading.isGraded ? `${card.grading.company ?? ""} ${card.grading.grade ?? ""}`.trim() : null],
    ["Cert.nr", card.grading.certNumber],
  ];
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Identifiering</h3>
        {onEdit && (
          <button className="link-button" type="button" onClick={onEdit}>
            <Icon name="edit" size={16} /> Rätta
          </button>
        )}
      </div>
      <dl className="details">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <p className="muted small">AI-säkerhet på identifieringen: {Math.round(card.confidence * 100)} %</p>
      {card.notes && <p className="small">{card.notes}</p>}
    </section>
  );
}
