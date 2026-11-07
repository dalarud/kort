/** Linear-interpolated quantile of a sorted array (q in 0..1). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (pos - lower);
}

/** Removes the top and bottom `fraction` of values (used to drop outliers). */
export function trim(values: number[], fraction = 0.2): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * fraction);
  return sorted.slice(cut, sorted.length - cut || undefined);
}

/** Lowercase and strip accents so "Ødegaard" matches "odegaard". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase();
}
