export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Orientation = "portrait" | "landscape";

/** Standard trading card: 63 × 88 mm (2.5 × 3.5 in). Width / height in portrait. */
export const CARD_RATIO = 63 / 88;

/** Largest card-shaped rectangle that fits centred inside the view, leaving a margin. */
export function fitGuide(viewW: number, viewH: number, orientation: Orientation, margin = 0.08): Rect {
  const ratio = orientation === "portrait" ? CARD_RATIO : 1 / CARD_RATIO;
  const maxW = viewW * (1 - 2 * margin);
  const maxH = viewH * (1 - 2 * margin);
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { x: (viewW - width) / 2, y: (viewH - height) / 2, width, height };
}

/**
 * Maps a rectangle in view (CSS pixel) coordinates to source pixels of a video that
 * is displayed with `object-fit: cover` (scaled to fill and centre-cropped).
 */
export function viewRectToSource(rect: Rect, viewW: number, viewH: number, srcW: number, srcH: number): Rect {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const offsetX = (viewW - srcW * scale) / 2;
  const offsetY = (viewH - srcH * scale) / 2;
  const x0 = Math.max(0, (rect.x - offsetX) / scale);
  const y0 = Math.max(0, (rect.y - offsetY) / scale);
  const x1 = Math.min(srcW, (rect.x + rect.width - offsetX) / scale);
  const y1 = Math.min(srcH, (rect.y + rect.height - offsetY) / scale);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Scales dimensions down (never up) so the longest side is at most maxSide. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
