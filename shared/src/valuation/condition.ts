import type { CardIdentification, ConditionAssessment } from "../schemas";
import { clamp } from "../normalize";

/**
 * Value multipliers relative to a raw card in roughly NM-MT condition (= 1.0).
 *
 * The numbers are deliberately conservative averages for modern football cards.
 * For low-pop, high-end cards a PSA 10 premium can be much larger.
 */
const GRADE_CURVE: Array<[grade: number, multiplier: number]> = [
  [1, 0.15],
  [3, 0.25],
  [5, 0.45],
  [6, 0.6],
  [7, 0.75],
  [8, 1.0],
  [8.5, 1.15],
  [9, 1.5],
  [9.5, 2.3],
  [10, 3.0],
];

/** Multiplier for a graded card. BGS 10 (Pristine/Black Label) gets a premium. */
export function gradeMultiplier(grade: number, company: string | null = "PSA"): number {
  const g = clamp(grade, 1, 10);
  if (g === 10 && company && /bgs|beckett/i.test(company)) return 5.0;
  for (let i = 1; i < GRADE_CURVE.length; i++) {
    const [g1, m1] = GRADE_CURVE[i - 1]!;
    const [g2, m2] = GRADE_CURVE[i]!;
    if (g <= g2) return m1 + ((g - g1) / (g2 - g1)) * (m2 - m1);
  }
  return GRADE_CURVE[GRADE_CURVE.length - 1]![1];
}

/** Multiplier for a raw (ungraded) card based on the estimated condition 1–10. */
export function rawConditionMultiplier(overall: number): number {
  const o = clamp(overall, 1, 10);
  if (o >= 9.5) return 1.1;
  if (o >= 9) return 1.0;
  if (o >= 8) return 0.85;
  if (o >= 7) return 0.65;
  if (o >= 6) return 0.5;
  if (o >= 5) return 0.35;
  if (o >= 3) return 0.2;
  return 0.12;
}

/** The multiplier that applies to the card as it is right now (graded or raw). */
export function currentConditionMultiplier(card: CardIdentification, condition: ConditionAssessment): number {
  if (card.grading.isGraded && card.grading.grade != null) {
    return gradeMultiplier(card.grading.grade, card.grading.company);
  }
  return rawConditionMultiplier(condition.overall);
}

/**
 * Conservative grade prediction from a photo: half a grade below the visual
 * estimate, rounded to a whole grade (PSA mostly uses whole grades).
 */
export function predictGrade(overall: number): number {
  return clamp(Math.round(clamp(overall, 1, 10) - 0.5), 1, 10);
}

export interface GradeScenario {
  label: string;
  grade: number | null;
  /** Value in USD */
  value: number;
  likely: boolean;
}

export interface GradingAdvice {
  verdict: "worth_it" | "maybe" | "not_worth_it" | "already_graded";
  message: string;
}

/**
 * Given the card's current value (USD), estimate its value at different grades and
 * whether sending it for grading is likely to pay off.
 */
export function gradeScenarios(
  currentValueUsd: number,
  card: CardIdentification,
  condition: ConditionAssessment,
  gradingCostUsd: number,
): { scenarios: GradeScenario[]; advice: GradingAdvice } {
  const baseline = currentValueUsd / currentConditionMultiplier(card, condition);

  if (card.grading.isGraded) {
    const grade = card.grading.grade;
    const scenarios: GradeScenario[] = [9, 10]
      .filter((g) => grade == null || g !== grade)
      .map((g) => ({ label: `${card.grading.company ?? "PSA"} ${g}`, grade: g, value: baseline * gradeMultiplier(g, card.grading.company), likely: false }));
    scenarios.unshift({
      label: `${card.grading.company ?? "Graderat"} ${grade ?? ""} (nu)`.trim(),
      grade,
      value: currentValueUsd,
      likely: true,
    });
    return {
      scenarios,
      advice: { verdict: "already_graded", message: "Kortet är redan graderat." },
    };
  }

  const predicted = predictGrade(condition.overall);
  const grades = Array.from(new Set([8, 9, 10, predicted])).sort((a, b) => a - b);
  const scenarios: GradeScenario[] = [
    { label: "Ograderat (nuvarande skick)", grade: null, value: currentValueUsd, likely: false },
    ...grades.map((g) => ({
      label: `PSA ${g}`,
      grade: g,
      value: baseline * gradeMultiplier(g),
      likely: g === predicted,
    })),
  ];

  const gradedValue = baseline * gradeMultiplier(predicted);
  const gain = gradedValue - currentValueUsd - gradingCostUsd;

  let advice: GradingAdvice;
  if (gain > gradingCostUsd) {
    advice = {
      verdict: "worth_it",
      message: `Gradering lönar sig troligen. Med ett troligt betyg runt PSA ${predicted} ökar värdet mer än graderingskostnaden.`,
    };
  } else if (gain > 0) {
    advice = {
      verdict: "maybe",
      message: `Kan vara värt att gradera om skicket håller PSA ${predicted} eller bättre – marginalen är liten.`,
    };
  } else {
    advice = {
      verdict: "not_worth_it",
      message: "Gradering lönar sig troligen inte – kostnaden är högre än den förväntade värdeökningen.",
    };
  }
  return { scenarios, advice };
}
