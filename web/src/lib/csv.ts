import { convert, type Rates } from "@kort/shared";
import type { CardEntry } from "../types";

function cell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: unknown[][], separator = ";"): string {
  return rows.map((row) => row.map(cell).join(separator)).join("\r\n");
}

const yesNo = (value: boolean) => (value ? "Ja" : "Nej");

/** CSV for Swedish Excel: semicolon separated, decimal comma, UTF-8 BOM. */
export function cardsToCsv(cards: CardEntry[], currency: string, rates: Rates | null): string {
  const money = (card: CardEntry, value: number) => {
    const converted = rates ? convert(value, card.valuation.currency, currency, rates) : null;
    const amount = converted ?? value;
    return amount.toFixed(2).replace(".", ",");
  };
  const header = [
    "Spelare", "Lag", "Säsong", "Tillverkare", "Serie", "Kortnummer", "Parallell", "Numrering", "Insert",
    "Rookie", "Autograf", "Tröjbit", "Gradering", "Skick (uppskattat)",
    `Värde låg (${currency})`, `Värde (${currency})`, `Värde hög (${currency})`, "Säkerhet", "Värderad", "Sparad",
  ];
  const rows = cards.map((card) => {
    const id = card.identification;
    return [
      id.player, id.team, id.season, id.manufacturer, id.set, id.cardNumber, id.parallel, id.serialNumber, id.insert,
      yesNo(id.isRookie), yesNo(id.isAutograph), yesNo(id.isMemorabilia),
      id.grading.isGraded ? `${id.grading.company ?? ""} ${id.grading.grade ?? ""}`.trim() : "",
      String(card.condition.overall).replace(".", ","),
      money(card, card.valuation.low), money(card, card.valuation.mid), money(card, card.valuation.high),
      card.valuation.confidenceLabel,
      card.valuation.generatedAt.slice(0, 10),
      card.createdAt.slice(0, 10),
    ];
  });
  return `﻿${toCsv([header, ...rows])}`;
}
