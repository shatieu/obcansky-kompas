/**
 * Ikony webu z geometrie vlajky (design systém „Vlajka“): celá vlajka 3:2, bílý pruh nahoře,
 * červený dole, modrý klín do poloviny délky, obrys flag-edge (#0B1B33) vně vlajky.
 * Žádné AI obrázky – každý pixel se spočítá z geometrie (supersampling), výstup je deterministický.
 *
 *   pnpm icons   →  app/favicon.ico (16, 32, 48), app/icon.svg, app/apple-icon.png (180),
 *                   public/icons/icon-192.png, public/icons/icon-512.png (manifest, maskable)
 *
 * Soubory se commitují; skript se spouští jen při změně geometrie nebo barev.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");

type RGB = readonly [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  white: hex("#FFFFFF"),
  red: hex("#D7141A"),
  blue: hex("#11457E"),
  edge: hex("#0B1B33"),
} as const;

interface Layout {
  /** Rozměr čtvercového plátna. */
  size: number;
  /** Šířka vlajky bez obrysu (násobek 3 → celé pixely, výška = 2/3). */
  flagW: number;
  /** Šířka obrysu vně vlajky. */
  edge: number;
  /** Pozadí plátna; null = průhledné. */
  bg: RGB | null;
}

/** Barva bodu (x, y) v souřadnicích plátna, nebo null = pozadí. */
function colorAt(l: Layout, x: number, y: number): RGB | null {
  const w = l.flagW;
  const h = (w * 2) / 3;
  const ox = (l.size - w) / 2;
  const oy = (l.size - h) / 2;
  const fx = x - ox;
  const fy = y - oy;
  if (fx < -l.edge || fy < -l.edge || fx >= w + l.edge || fy >= h + l.edge) return null;
  if (fx < 0 || fy < 0 || fx >= w || fy >= h) return C.edge;
  // Klín: (0,0) → (w/2, h/2) → (0,h).
  const k = h / w;
  if (fy >= fx * k && fy <= h - fx * k) return C.blue;
  return fy < h / 2 ? C.white : C.red;
}

/** RGBA pixely, supersampling n×n na pixel (vyhlazení šikmých hran klínu). */
function render(l: Layout, n = 8): Uint8Array {
  const out = new Uint8Array(l.size * l.size * 4);
  for (let py = 0; py < l.size; py++) {
    for (let px = 0; px < l.size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = colorAt(l, px + (sx + 0.5) / n, py + (sy + 0.5) / n) ?? l.bg;
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (py * l.size + px) * 4;
      if (a) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
      }
      out[i + 3] = Math.round((a / (n * n)) * 255);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bitová hloubka
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtr None
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** ICO s PNG obrázky uvnitř (podporují všechny současné prohlížeče i Windows Vista+). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    header[e] = img.size >= 256 ? 0 : img.size;
    header[e + 1] = img.size >= 256 ? 0 : img.size;
    header[e + 2] = 0;
    header[e + 3] = 0;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const icon = (l: Layout) => png(l.size, render(l));

/*
 * Favicon (průhledné pozadí, vlajka přes celou šířku, ostré vodorovné hrany na celých pixelech):
 *   16: vlajka 12×8 + obrys 1 = 14×10      32: 30×20 + 1 = 32×22      48: 42×28 + 1 = 44×30
 */
const FAVICON: Layout[] = [
  { size: 16, flagW: 12, edge: 1, bg: null },
  { size: 32, flagW: 30, edge: 1, bg: null },
  { size: 48, flagW: 42, edge: 1, bg: null },
];

/** Apple: bílý čtverec 180, vlajka 120×80 + obrys 2, volné okolí ≥ ¼ výšky vlajky (README „Vlajka“). */
const APPLE: Layout = { size: 180, flagW: 120, edge: 2, bg: C.white };

/**
 * Manifest (purpose any i maskable): bílá plocha, vlajka 0,6 šířky – celá i s obrysem leží
 * v bezpečném kruhu maskable ikon (poloměr 0,4 šířky), takže ji žádná maska neořízne.
 */
const MANIFEST: Layout[] = [
  { size: 192, flagW: 114, edge: 2, bg: C.white },
  { size: 512, flagW: 306, edge: 5, bg: C.white },
];

/** Vektorová ikona: stejná geometrie jako favicon 32 px. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="0" y="5" width="32" height="22" fill="#0B1B33"/><rect x="1" y="6" width="30" height="10" fill="#FFFFFF"/><rect x="1" y="16" width="30" height="10" fill="#D7141A"/><path d="M1 6L16 16 1 26z" fill="#11457E"/></svg>
`;

function main() {
  const write = (rel: string, data: Buffer | string) => {
    const file = path.join(ROOT, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
    console.log(`${rel}  ${Buffer.byteLength(data)} B`);
  };
  write("app/favicon.ico", ico(FAVICON.map((l) => ({ size: l.size, data: icon(l) }))));
  write("app/icon.svg", SVG);
  write("app/apple-icon.png", icon(APPLE));
  for (const l of MANIFEST) write(`public/icons/icon-${l.size}.png`, icon(l));
}

main();
