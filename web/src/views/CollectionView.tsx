import { useEffect, useMemo, useState } from "react";
import { convert, describeCard, formatMoney, roundMoney, type DisplayCurrency, type Rates } from "@kort/shared";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { cardsToCsv } from "../lib/csv";
import { listCards } from "../lib/storage";
import type { CardEntry } from "../types";

type Sort = "value" | "newest" | "name";

interface Props {
  currency: DisplayCurrency;
  onOpen: (entry: CardEntry) => void;
  onScan: () => void;
}

export function CollectionView({ currency, onOpen, onScan }: Props) {
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [sort, setSort] = useState<Sort>("value");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCards()
      .then(setCards)
      .catch(() => {
        setCards([]);
        setError("Samlingen kunde inte läsas (lagring är avstängd i webbläsaren?).");
      });
    api.rates().then(setRates).catch(() => setRates(null));
  }, []);

  // Each card is valued in the currency chosen at scan time – convert for display.
  const valueOf = (card: CardEntry, field: "low" | "mid" | "high" = "mid") => {
    const amount = card.valuation[field];
    if (card.valuation.currency === currency) return amount;
    return convert(amount, card.valuation.currency, currency, rates ?? card.valuation.rates) ?? amount;
  };

  const visible = useMemo(() => {
    if (!cards) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? cards.filter((c) =>
          [c.identification.player, c.identification.team, c.identification.set, c.identification.season, c.identification.manufacturer]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : cards;
    return [...filtered].sort((a, b) => {
      if (sort === "value") return valueOf(b) - valueOf(a);
      if (sort === "name") return (a.identification.player ?? "").localeCompare(b.identification.player ?? "", "sv");
      return b.createdAt.localeCompare(a.createdAt);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, query, sort, rates, currency]);

  const totals = useMemo(() => {
    const all = cards ?? [];
    const sum = (field: "low" | "mid" | "high") => roundMoney(all.reduce((acc, c) => acc + valueOf(c, field), 0));
    return { low: sum("low"), mid: sum("mid"), high: sum("high") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, rates, currency]);

  const exportCsv = () => {
    if (!cards?.length) return;
    const blob = new Blob([cardsToCsv(cards, currency, rates)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kortkollen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cards === null) return <p className="muted center">Laddar samlingen…</p>;

  if (cards.length === 0) {
    return (
      <div className="empty">
        <Icon name="cards" size={48} />
        <h2>Samlingen är tom</h2>
        <p className="muted">Skanna ett kort och tryck på ”Spara i samlingen” så hamnar det här.</p>
        {error && <p className="banner banner-error">{error}</p>}
        <button className="button" type="button" onClick={onScan}>
          <Icon name="camera" size={18} /> Skanna ditt första kort
        </button>
      </div>
    );
  }

  return (
    <div className="collection">
      <section className="panel total-panel">
        <p className="eyebrow">Samlingens värde</p>
        <p className="value-mid" data-testid="collection-total">
          {formatMoney(totals.mid, currency)}
        </p>
        <p className="muted">
          {cards.length} kort · intervall {formatMoney(totals.low, currency)} –{" "}
          {formatMoney(totals.high, currency)}
        </p>
        <button className="link-button" type="button" onClick={exportCsv}>
          <Icon name="download" size={16} /> Exportera CSV
        </button>
      </section>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Sök spelare, lag, serie…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortering">
          <option value="value">Värde ↓</option>
          <option value="newest">Nyast</option>
          <option value="name">Namn A–Ö</option>
        </select>
      </div>

      <ul className="card-grid">
        {visible.map((card) => {
          const { title, subtitle } = describeCard(card.identification);
          return (
            <li key={card.id}>
              <button type="button" className="card-tile" onClick={() => onOpen(card)}>
                <img src={card.thumbnail ?? card.image} alt="" loading="lazy" />
                <span className="tile-title">{title}</span>
                <span className="tile-sub">{subtitle}</span>
                <span className="tile-value">{formatMoney(roundMoney(valueOf(card)), currency)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="muted center">Inga kort matchar sökningen.</p>}
    </div>
  );
}
