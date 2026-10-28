import type { PdfFontBytes } from "./pdf-common";

/**
 * Písmo pro PDF: Mona Sans (OFL, docs/design-system/project/fonts) převedené z WOFF2 na TTF
 * a zúžené na latinku + Latin Extended-A + typografické znaky (≈ 50 kB na řez).
 * pdf-lib neumí podmnožinu z WOFF2, proto TTF. Moduly fonts/*.ts drží base64 a načítají se
 * dynamicky až při exportu, takže nejsou v JS stránky.
 *
 * Přegenerování (Python + fontTools + brotli):
 *   python -m fontTools.subset docs/design-system/project/fonts/MonaSans-Regular.woff2 \
 *     --unicodes="U+0020-007E,U+00A0-017F,U+2010-2027,U+2030-203A,U+20AC,U+2116,U+2122,U+2212" \
 *     --layout-features='kern,liga,tnum,lnum' --flavor= --output-file=MonaSans-Regular.ttf
 *   (stejně MonaSans-SemiBold) a výsledek zakódovat do base64 v fonts/mona-sans-*.ts.
 */

function fromBase64(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

let cached: Promise<PdfFontBytes> | null = null;

export function loadPdfFonts(): Promise<PdfFontBytes> {
  cached ??= Promise.all([import("./fonts/mona-sans-regular"), import("./fonts/mona-sans-semibold")]).then(([r, b]) => ({
    regular: fromBase64(r.FONT_BASE64),
    bold: fromBase64(b.FONT_BASE64),
  }));
  return cached;
}
