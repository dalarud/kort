import { Errors } from "./errors";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface DecodedImage {
  mediaType: ImageMediaType;
  /** Base64 without data-URL prefix. */
  base64: string;
  bytes: number;
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Detects the image type from its first bytes ("magic numbers"). */
export function sniffImageType(buffer: Uint8Array): ImageMediaType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return "image/png";
  if (
    buffer.length >= 12 &&
    String.fromCharCode(...buffer.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...buffer.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Accepts a data URL or bare base64 string and validates that it is a supported image. */
export function decodeImage(input: string): DecodedImage {
  const match = input.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  const base64 = (match ? match[2]! : input).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw Errors.invalidImage();

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) throw Errors.imageTooLarge();
  const mediaType = sniffImageType(buffer);
  if (!mediaType) throw Errors.invalidImage();
  return { mediaType, base64, bytes: buffer.length };
}
