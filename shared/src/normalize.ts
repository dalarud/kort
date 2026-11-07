import type { CardIdentification, ConditionAssessment } from "./schemas";

const MAX_TEXT = 200;
const MAX_NOTES = 1000;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cleanText(value: string | null, max = MAX_TEXT): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || /^(null|okänd|unknown|n\/a|-)$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

/** Parses "23/99" → 99. Returns null when no print run can be read. */
export function parsePrintRun(serial: string | null): number | null {
  if (!serial) return null;
  const match = serial.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return Number(match[2]);
  const single = serial.match(/^\s*\/\s*(\d+)\s*$/);
  return single ? Number(single[1]) : null;
}

/** Rounds to the nearest half step, the granularity used by grading companies. */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Makes model output (or user edits) safe to use: trims text, clamps numbers,
 * fills in the print run from the serial number and keeps grading consistent.
 */
export function normalizeIdentification(input: CardIdentification): CardIdentification {
  const serialNumber = cleanText(input.serialNumber, 20);
  let printRun = input.printRun != null && input.printRun > 0 ? Math.round(input.printRun) : null;
  printRun ??= parsePrintRun(serialNumber);

  const isGraded = Boolean(input.grading.isGraded && (input.grading.company || input.grading.grade != null));
  const grade = input.grading.grade != null ? roundToHalf(clamp(input.grading.grade, 1, 10)) : null;

  const identification: CardIdentification = {
    ...input,
    player: cleanText(input.player),
    team: cleanText(input.team),
    season: cleanText(input.season, 20),
    manufacturer: cleanText(input.manufacturer),
    set: cleanText(input.set),
    cardNumber: cleanText(input.cardNumber, 20),
    parallel: cleanText(input.parallel),
    serialNumber,
    printRun,
    insert: cleanText(input.insert),
    grading: {
      isGraded,
      company: isGraded ? (cleanText(input.grading.company, 20)?.toUpperCase() ?? null) : null,
      grade: isGraded ? grade : null,
      certNumber: isGraded ? cleanText(input.grading.certNumber, 30) : null,
    },
    searchQuery: cleanText(input.searchQuery) ?? "",
    confidence: clamp(input.confidence, 0, 1),
    notes: cleanText(input.notes, MAX_NOTES) ?? "",
  };

  if (!identification.searchQuery) identification.searchQuery = buildSearchQuery(identification);
  return identification;
}

export function normalizeCondition(input: ConditionAssessment): ConditionAssessment {
  const score = (n: number) => roundToHalf(clamp(n, 1, 10));
  return {
    centering: score(input.centering),
    corners: score(input.corners),
    edges: score(input.edges),
    surface: score(input.surface),
    overall: score(input.overall),
    summary: cleanText(input.summary, MAX_NOTES) ?? "",
    issues: input.issues
      .map((issue) => cleanText(issue))
      .filter((issue): issue is string => Boolean(issue))
      .slice(0, 10),
  };
}

/** Builds a marketplace search query such as "2020-21 Panini Prizm Saka Silver #1 /99". */
export function buildSearchQuery(card: CardIdentification): string {
  const parts = [
    card.season,
    card.manufacturer,
    card.set && card.manufacturer && card.set.toLowerCase().startsWith(card.manufacturer.toLowerCase())
      ? card.set.slice(card.manufacturer.length).trim()
      : card.set,
    card.player,
    card.parallel,
    card.insert,
    card.cardNumber ? `#${card.cardNumber.replace(/^#/, "")}` : null,
    card.printRun ? `/${card.printRun}` : null,
    card.isRookie ? "RC" : null,
    card.isAutograph ? "Auto" : null,
    card.grading.isGraded && card.grading.company
      ? `${card.grading.company} ${card.grading.grade ?? ""}`.trim()
      : null,
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Short human readable title, e.g. "Bukayo Saka – 2020-21 Panini Prizm #1". */
export function describeCard(card: CardIdentification): { title: string; subtitle: string } {
  const title = card.player ?? "Okänd spelare";
  const subtitle = [card.season, card.manufacturer, card.set, card.cardNumber ? `#${card.cardNumber.replace(/^#/, "")}` : null]
    .filter(Boolean)
    .join(" · ");
  return { title, subtitle: subtitle || "Okänd serie" };
}
