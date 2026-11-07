export type QualityVerdict = "ok" | "dark" | "bright" | "glare" | "blurry";

export interface QualityReport {
  /** Mean luminance 0–255 */
  brightness: number;
  /** Variance of the Laplacian – higher is sharper */
  sharpness: number;
  /** Share of (almost) blown-out pixels 0–1 */
  glare: number;
  verdict: QualityVerdict;
  message: string;
}

export const THRESHOLDS = {
  dark: 55,
  bright: 225,
  glare: 0.06,
  blurry: 25,
};

/** RGBA → luminance (Rec. 601). */
export function toGray(data: Uint8ClampedArray | number[], width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!;
  }
  return gray;
}

/** Variance of the 4-neighbour Laplacian – a classic, cheap focus measure. */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1]! + gray[i + 1]! + gray[i - width]! + gray[i + width]! - 4 * gray[i]!;
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function assessQuality(data: Uint8ClampedArray | number[], width: number, height: number): QualityReport {
  const gray = toGray(data, width, height);
  let total = 0;
  let blown = 0;
  for (const value of gray) {
    total += value;
    if (value > 250) blown++;
  }
  const brightness = total / gray.length;
  const glare = blown / gray.length;
  const sharpness = laplacianVariance(gray, width, height);

  const report = (verdict: QualityVerdict, message: string): QualityReport => ({ brightness, sharpness, glare, verdict, message });

  if (brightness < THRESHOLDS.dark) return report("dark", "För mörkt – tänd lampan eller gå mot ljuset");
  if (glare > THRESHOLDS.glare) return report("glare", "Reflexer – vinkla kortet lite");
  if (brightness > THRESHOLDS.bright) return report("bright", "För ljust – undvik direkt ljus");
  if (sharpness < THRESHOLDS.blurry) return report("blurry", "Håll stilla – bilden är suddig");
  return report("ok", "Ser bra ut – ta bilden!");
}
