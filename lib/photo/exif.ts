/**
 * EXIF orientace a metadata (čistá logika nad bajty, bez DOM).
 *
 * - `readJpegInfo` přečte orientaci (tag 0x0112) a uložené rozměry (SOFn) z JPEG.
 * - `orientationTransform` vrátí matici pro canvas, která fotku narovná.
 * - `stripJpegMetadata` / `stripPngMetadata` odstraní metadata z exportu (pojistka:
 *   export se vždy znovu kóduje z canvasu, takže EXIF/GPS původní fotky v něm není).
 * - `isHeicBytes` pozná HEIC/HEIF podle hlavičky `ftyp`.
 */

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface JpegInfo {
  orientation: Orientation;
  /** Rozměry tak, jak jsou uložené v souboru (před otočením), nebo null. */
  width: number | null;
  height: number | null;
}

function isOrientation(n: number): n is Orientation {
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

function readOrientationFromTiff(view: DataView, tiff: number, end: number): Orientation {
  if (tiff + 8 > end) return 1;
  const order = view.getUint16(tiff);
  const little = order === 0x4949; // "II"
  if (!little && order !== 0x4d4d) return 1; // "MM"
  if (view.getUint16(tiff + 2, little) !== 42) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return 1;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return isOrientation(value) ? value : 1;
    }
  }
  return 1;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Orientace a uložené rozměry z JPEG. Pro jiné formáty vrátí orientaci 1. */
export function readJpegInfo(buf: ArrayBuffer | Uint8Array): JpegInfo {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const info: JpegInfo = { orientation: 1, width: null, height: null };
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return info;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return info;
    const marker = bytes[p + 1]!;
    if (marker === 0xff) {
      p++; // výplňový bajt
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return info; // EOI / SOS: dál už metadata nejsou
    const len = view.getUint16(p + 2);
    const segEnd = Math.min(bytes.length, p + 2 + len);
    if (len < 2) return info;
    if (marker === 0xe1 && p + 10 <= segEnd) {
      const isExif =
        bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66 && bytes[p + 8] === 0 && bytes[p + 9] === 0;
      if (isExif) info.orientation = readOrientationFromTiff(view, p + 10, segEnd);
    } else if (SOF_MARKERS.has(marker) && p + 9 <= segEnd) {
      info.height = view.getUint16(p + 5);
      info.width = view.getUint16(p + 7);
    }
    p = p + 2 + len;
  }
  return info;
}

/** Orientace 5–8 prohazují šířku a výšku. */
export function swapsAxes(o: Orientation): boolean {
  return o >= 5;
}

export interface OrientationTransform {
  /** Rozměr plátna po narovnání. */
  width: number;
  height: number;
  /** Argumenty pro ctx.setTransform(a, b, c, d, e, f); pak drawImage(img, 0, 0). */
  matrix: [number, number, number, number, number, number];
}

/** Transformace, která fotku uloženou jako w × h s EXIF orientací `o` narovná. */
export function orientationTransform(o: Orientation, w: number, h: number): OrientationTransform {
  const m: Record<Orientation, OrientationTransform["matrix"]> = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, h, 0],
    7: [0, -1, -1, 0, h, w],
    8: [0, -1, 1, 0, 0, w],
  };
  return swapsAxes(o) ? { width: h, height: w, matrix: m[o] } : { width: w, height: h, matrix: m[o] };
}

/** Použije matici na bod (pro testy a kontrolu). */
export function applyMatrix(m: OrientationTransform["matrix"], x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

/**
 * Musí aplikace otočit fotku sama? Prohlížeče od 2020 orientaci při dekódování
 * obvykle použijí; u otočení o 90° to poznáme z rozměrů, jinak rozhodne sonda
 * `browserApplies` (dekódování malého JPEG s orientací 6, viz lib/photo/decode.ts).
 */
export function needsManualOrientation(
  info: JpegInfo,
  decoded: { w: number; h: number },
  browserApplies: boolean,
): boolean {
  if (info.orientation === 1) return false;
  if (swapsAxes(info.orientation) && info.width && info.height && info.width !== info.height) {
    const rotated = decoded.w === info.height && decoded.h === info.width;
    const raw = decoded.w === info.width && decoded.h === info.height;
    if (rotated) return false;
    if (raw) return true;
  }
  return !browserApplies;
}

/** Segment APP1 s EXIFem obsahujícím jen orientaci (pro sondu prohlížeče). */
export function buildExifOrientationSegment(o: Orientation): Uint8Array {
  // FFE1, délka 34, "Exif\0\0", TIFF "MM\0*" + offset 8, 1 položka, tag 0112 SHORT 1, další IFD 0
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

/** Vloží segment hned za SOI (FFD8). */
export function insertAfterSoi(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Není JPEG");
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/**
 * Odstraní z JPEG všechny segmenty APP1–APP15 (EXIF, XMP, ICC, IPTC…) a komentáře.
 * Ponechá APP0 (JFIF) a vše potřebné k dekódování.
 */
export function stripJpegMetadata(jpeg: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let p = 2;
  while (p + 4 <= jpeg.length) {
    if (jpeg[p] !== 0xff) break;
    const marker = jpeg[p + 1]!;
    if (marker === 0xda || marker === 0xd9) break; // od SOS dál obrazová data
    const len = view.getUint16(p + 2);
    const end = p + 2 + len;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(jpeg.subarray(p, end));
    p = end;
  }
  parts.push(jpeg.subarray(Math.min(p, jpeg.length)));
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/** Odstraní z PNG textové bloky, EXIF a čas (tEXt, zTXt, iTXt, eXIf, tIME). */
export function stripPngMetadata(png: Uint8Array): Uint8Array {
  if (!PNG_SIG.every((b, i) => png[i] === b)) return png;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let p = 8;
  while (p + 12 <= png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(png[p + 4]!, png[p + 5]!, png[p + 6]!, png[p + 7]!);
    const end = p + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(png.subarray(p, Math.min(end, png.length)));
    p = end;
  }
  const total = parts.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of parts) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** Obsahuje JPEG ještě EXIF? (kontrola exportu) */
export function hasJpegExif(jpeg: Uint8Array): boolean {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return false;
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  let p = 2;
  while (p + 4 <= jpeg.length && jpeg[p] === 0xff) {
    const marker = jpeg[p + 1]!;
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === 0xe1) return true;
    p += 2 + view.getUint16(p + 2);
  }
  return false;
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** HEIC/HEIF podle hlavičky ISO BMFF (`....ftypheic`). AVIF (`avif`) sem nepatří. */
export function isHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ftyp = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return HEIF_BRANDS.has(brand);
}

/** HEIC podle názvu nebo MIME (iOS někdy posílá prázdný typ). */
export function looksLikeHeic(name: string, type: string): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(type) || /\.hei[cf]$/i.test(name);
}
