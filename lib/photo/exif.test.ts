import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  buildExifOrientationSegment,
  hasJpegExif,
  insertAfterSoi,
  isHeicBytes,
  looksLikeHeic,
  needsManualOrientation,
  orientationTransform,
  readJpegInfo,
  stripJpegMetadata,
  stripPngMetadata,
  type Orientation,
} from "./exif";

/** Minimální JPEG-like proud: SOI, APP0, SOF0 (w × h), SOS + data, EOI. */
function fakeJpeg(w: number, h: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x01, 0x01, 0x11, 0x00];
  const sos = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sof0, ...sos, 0xff, 0xd9]);
}

/** EXIF v pořadí bajtů Intel (II), aby se otestovaly obě varianty. */
function littleEndianExif(o: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, o, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

describe("EXIF orientace", () => {
  it("přečte orientaci (MM i II) a uložené rozměry", () => {
    const base = fakeJpeg(400, 300);
    expect(readJpegInfo(base)).toEqual({ orientation: 1, width: 400, height: 300 });
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
      expect(readJpegInfo(insertAfterSoi(base, buildExifOrientationSegment(o))).orientation).toBe(o);
      expect(readJpegInfo(insertAfterSoi(base, littleEndianExif(o))).orientation).toBe(o);
    }
  });

  it("neplatná data a jiné formáty = orientace 1", () => {
    expect(readJpegInfo(new Uint8Array([1, 2, 3])).orientation).toBe(1);
    expect(readJpegInfo(insertAfterSoi(fakeJpeg(2, 2), littleEndianExif(9))).orientation).toBe(1);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readJpegInfo(png)).toEqual({ orientation: 1, width: null, height: null });
  });

  it("každá orientace zobrazí plátno beze zbytku (rohy padnou do rohů)", () => {
    const w = 40;
    const h = 30;
    for (const o of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
      const t = orientationTransform(o, w, h);
      expect([t.width, t.height]).toEqual(o >= 5 ? [h, w] : [w, h]);
      const corners = [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ].map(([x, y]) => applyMatrix(t.matrix, x!, y!).map((v) => Math.round(v) + 0).join(","));
      expect(new Set(corners)).toEqual(new Set([`0,0`, `${t.width},0`, `0,${t.height}`, `${t.width},${t.height}`]));
    }
  });

  it("orientace 6 = otočení o 90° doprava: levý horní roh jde doprava nahoru", () => {
    const t = orientationTransform(6, 40, 30);
    expect(applyMatrix(t.matrix, 0, 0)).toEqual([30, 0]);
    expect(applyMatrix(t.matrix, 0, 30)).toEqual([0, 0]);
    const t3 = orientationTransform(3, 40, 30);
    expect(applyMatrix(t3.matrix, 0, 0)).toEqual([40, 30]);
    const t8 = orientationTransform(8, 40, 30);
    expect(applyMatrix(t8.matrix, 0, 0)).toEqual([0, 40]);
  });

  it("ruční otočení jen když ho prohlížeč neudělal", () => {
    const info = { orientation: 6 as const, width: 400, height: 300 };
    expect(needsManualOrientation(info, { w: 300, h: 400 }, false)).toBe(false); // už otočeno
    expect(needsManualOrientation(info, { w: 400, h: 300 }, true)).toBe(true); // rozměry prozradí
    expect(needsManualOrientation({ orientation: 3, width: 400, height: 300 }, { w: 400, h: 300 }, true)).toBe(false);
    expect(needsManualOrientation({ orientation: 3, width: 400, height: 300 }, { w: 400, h: 300 }, false)).toBe(true);
    expect(needsManualOrientation({ orientation: 1, width: 1, height: 1 }, { w: 1, h: 1 }, false)).toBe(false);
  });
});

describe("odstranění metadat", () => {
  it("JPEG: pryč EXIF (APP1–15) a komentáře, obraz zůstane", () => {
    const comment = Uint8Array.from([0xff, 0xfe, 0x00, 0x06, 0x47, 0x50, 0x53, 0x21]);
    const dirty = insertAfterSoi(insertAfterSoi(fakeJpeg(10, 10), buildExifOrientationSegment(6)), comment);
    expect(hasJpegExif(dirty)).toBe(true);
    const clean = stripJpegMetadata(dirty);
    expect(hasJpegExif(clean)).toBe(false);
    expect(Array.from(clean)).toEqual(Array.from(fakeJpeg(10, 10)));
    expect(readJpegInfo(clean)).toEqual({ orientation: 1, width: 10, height: 10 });
  });

  it("PNG: pryč tEXt, iTXt, zTXt, eXIf, tIME", () => {
    const chunk = (type: string, data: number[]) => {
      const len = data.length;
      return [0, 0, (len >> 8) & 0xff, len & 0xff, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = chunk("IHDR", new Array(13).fill(1));
    const idat = chunk("IDAT", [1, 2, 3]);
    const iend = chunk("IEND", []);
    const dirty = Uint8Array.from([...sig, ...ihdr, ...chunk("tEXt", [65, 0, 66]), ...chunk("eXIf", [1, 2]), ...chunk("tIME", [1, 2, 3, 4, 5, 6, 7]), ...idat, ...chunk("iTXt", [1]), ...iend]);
    const clean = stripPngMetadata(dirty);
    expect(Array.from(clean)).toEqual([...sig, ...ihdr, ...idat, ...iend]);
  });

  it("jiná data nechá být", () => {
    const x = Uint8Array.from([1, 2, 3]);
    expect(stripJpegMetadata(x)).toBe(x);
    expect(stripPngMetadata(x)).toBe(x);
  });
});

describe("HEIC", () => {
  const ftyp = (brand: string) => Uint8Array.from([0, 0, 0, 0x18, ...Array.from("ftyp" + brand, (c) => c.charCodeAt(0)), 0, 0, 0, 0]);
  it("pozná HEIC/HEIF podle ftyp, ne AVIF", () => {
    expect(isHeicBytes(ftyp("heic"))).toBe(true);
    expect(isHeicBytes(ftyp("mif1"))).toBe(true);
    expect(isHeicBytes(ftyp("avif"))).toBe(false);
    expect(isHeicBytes(fakeJpeg(1, 1))).toBe(false);
  });
  it("podle názvu a MIME", () => {
    expect(looksLikeHeic("IMG_0001.HEIC", "")).toBe(true);
    expect(looksLikeHeic("x.jpg", "image/heif")).toBe(true);
    expect(looksLikeHeic("x.jpg", "image/jpeg")).toBe(false);
  });
});
