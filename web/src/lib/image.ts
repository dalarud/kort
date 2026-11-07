import { fitWithin, type Rect } from "./crop";

/** Long side recommended for Claude vision – larger images are downscaled anyway. */
export const ANALYSIS_MAX_SIDE = 1568;
export const STORED_MAX_SIDE = 900;
export const THUMB_MAX_SIDE = 260;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bilden kunde inte läsas"));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Filen kunde inte läsas"));
    reader.readAsDataURL(file);
  });
}

function drawToJpeg(
  source: CanvasImageSource,
  region: Rect,
  maxSide: number,
  quality: number,
): string {
  const size = fitWithin(region.width, region.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Crops a region of the current video frame and encodes it as JPEG. */
export function captureRegion(video: HTMLVideoElement, region: Rect, maxSide = ANALYSIS_MAX_SIDE, quality = 0.9): string {
  return drawToJpeg(video, region, maxSide, quality);
}

/** Downscales an image (data URL) so the long side is at most maxSide. */
export async function resizeDataUrl(src: string, maxSide: number, quality = 0.88): Promise<string> {
  const img = await loadImage(src);
  return drawToJpeg(img, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }, maxSide, quality);
}

export async function fileToAnalysisImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Välj en bildfil (JPEG, PNG eller WebP).");
  return resizeDataUrl(await fileToDataUrl(file), ANALYSIS_MAX_SIDE, 0.9);
}
