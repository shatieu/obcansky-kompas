/**
 * Načtení fotky v prohlížeči: dekódování (včetně HEIC), narovnání podle EXIF a
 * zmenšení na rozumnou velikost. Výsledek je canvas bez jakýchkoli metadat.
 * Fotka nikdy neopustí prohlížeč.
 */
import { MAX_SOURCE_SIDE } from "./constants";
import { fitWithin, type Size } from "./crop";
import {
  buildExifOrientationSegment,
  insertAfterSoi,
  isHeicBytes,
  looksLikeHeic,
  needsManualOrientation,
  orientationTransform,
  readJpegInfo,
  type Orientation,
} from "./exif";

export type PhotoErrorCode = "type" | "decode" | "heic";

export class PhotoError extends Error {
  constructor(public code: PhotoErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = "PhotoError";
  }
}

export interface LoadedPhoto {
  canvas: HTMLCanvasElement;
  size: Size;
}

type Decoded = { source: CanvasImageSource; w: number; h: number; close: () => void };

async function decodeBlob(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      // Starší Safari neumí volby / některé formáty – zkusíme <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob selhalo"))), type, quality),
  );
}

let probe: Promise<boolean> | null = null;

/**
 * Otočí prohlížeč JPEG podle EXIF sám? Sonda: JPEG 2 × 1 s orientací 6 musí po
 * dekódování mít 1 × 2. Při chybě předpokládáme ano (všechny dnešní prohlížeče).
 */
export function browserAppliesExif(): Promise<boolean> {
  probe ??= (async () => {
    try {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 1;
      const jpeg = new Uint8Array(await (await canvasToBlob(c, "image/jpeg", 0.5)).arrayBuffer());
      const tagged = insertAfterSoi(jpeg, buildExifOrientationSegment(6));
      const d = await decodeBlob(new Blob([tagged as BlobPart], { type: "image/jpeg" }));
      d.close();
      return d.w === 1 && d.h === 2;
    } catch {
      return true;
    }
  })();
  return probe;
}

function isImageFile(file: File, head: Uint8Array): boolean {
  if (file.type.startsWith("image/")) return true;
  return looksLikeHeic(file.name, file.type) || isHeicBytes(head) || (head[0] === 0xff && head[1] === 0xd8);
}

/** Načte vybraný soubor do canvasu (narovnaný, delší strana max. MAX_SOURCE_SIDE). */
export async function loadPhoto(file: File, onHeic?: () => void): Promise<LoadedPhoto> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isImageFile(file, bytes.subarray(0, 16))) throw new PhotoError("type");
  const heic = isHeicBytes(bytes) || looksLikeHeic(file.name, file.type);

  let decoded: Decoded;
  let orientation: Orientation = 1;
  let manual = false;
  try {
    decoded = await decodeBlob(file);
    const info = readJpegInfo(bytes);
    orientation = info.orientation;
    if (orientation !== 1) manual = needsManualOrientation(info, decoded, await browserAppliesExif());
  } catch (e) {
    if (!heic) throw new PhotoError("decode", e);
    onHeic?.();
    try {
      decoded = await decodeBlob(await (await import("./heic")).heicToJpeg(file));
    } catch (err) {
      throw new PhotoError("heic", err);
    }
  }

  try {
    const t = manual
      ? orientationTransform(orientation, decoded.w, decoded.h)
      : orientationTransform(1, decoded.w, decoded.h);
    const out = fitWithin({ w: t.width, h: t.height }, MAX_SOURCE_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("decode");
    const k = out.w / t.width;
    const [a, b, c, d, e, f] = t.matrix;
    // Nejdřív zmenšit, pak otočit: výsledná matice = scale(k) · orientace.
    ctx.setTransform(a * k, b * k, c * k, d * k, e * k, f * k);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, decoded.w, decoded.h);
    return { canvas, size: out };
  } finally {
    decoded.close();
  }
}
