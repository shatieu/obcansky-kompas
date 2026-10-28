import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { wrapText } from "./text";

/**
 * Společné části PDF exportů (pdf-lib + vložené písmo s českou diakritikou).
 * Tento modul se načítá jen dynamicky (po kliknutí), aby pdf-lib nebyl v JS stránky.
 */

export const MM = 72 / 25.4;
export const A4 = { width: 595.28, height: 841.89 } as const;
export const INK = rgb(0x0b / 255, 0x1b / 255, 0x33 / 255);
export const INK_SECONDARY = rgb(0x45 / 255, 0x4e / 255, 0x5d / 255);

/** Bajty písem (TTF/OTF). Výchozí: Mona Sans z lib/export/fonts (loadPdfFonts). */
export interface PdfFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  /** Vynechá znaky, které písmo nemá (např. emoji ve vlastní větě). */
  safe: (s: string) => string;
}

export interface PdfMeta {
  title: string;
  subject?: string;
  /** „Občanský kompas“ */
  creator: string;
}

export async function createPdf(bytes: PdfFontBytes, meta: PdfMeta): Promise<{ doc: PDFDocument; fonts: PdfFonts }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(bytes.regular, { subset: true });
  const bold = await doc.embedFont(bytes.bold, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  supported.add(0x0a); // \n řeší zalamování, ne písmo
  const safe = (s: string) =>
    Array.from(s.normalize("NFC").replace(/\t/g, " "))
      .filter((ch) => supported.has(ch.codePointAt(0)!))
      .join("")
      .replace(/ {2,}/g, " ")
      .replace(/ ([.,;:!?])/g, "$1");
  doc.setTitle(safe(meta.title), { showInWindowTitleBar: true });
  if (meta.subject) doc.setSubject(safe(meta.subject));
  doc.setCreator(meta.creator);
  doc.setProducer(meta.creator);
  doc.setLanguage("cs-CZ");
  // Pevné datum vytvoření nepoužíváme – PDF vzniká v prohlížeči a čas je jen metadata.
  return { doc, fonts: { regular, bold, safe } };
}

export interface TextStyle {
  font: PDFFont;
  size: number;
  /** Výška řádku v bodech. */
  leading: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center" | "right";
  /** Odsazení zleva od okraje (body). */
  indent?: number;
}

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Tok textu přes stránky: drží aktuální stránku a pozici, zalamuje řádky a přidává
 * stránky. `y` je vzdálenost účaří od spodního okraje stránky (souřadnice pdf-lib).
 */
export class Flow {
  page: PDFPage;
  y: number;
  readonly pages: PDFPage[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: PdfFonts,
    readonly margins: Margins,
    firstPageTop?: number,
  ) {
    this.page = this.addPage();
    this.y = A4.height - (firstPageTop ?? margins.top);
  }

  get width(): number {
    return A4.width - this.margins.left - this.margins.right;
  }

  private addPage(): PDFPage {
    const p = this.doc.addPage([A4.width, A4.height]);
    this.pages.push(p);
    return p;
  }

  newPage(): void {
    this.page = this.addPage();
    this.y = A4.height - this.margins.top;
  }

  /** Zajistí místo pro `height` bodů, jinak začne novou stránku. */
  ensure(height: number): void {
    if (this.y - height < this.margins.bottom) this.newPage();
  }

  gap(points: number): void {
    this.y -= points;
  }

  lines(text: string, style: TextStyle): string[] {
    const measure = (s: string) => style.font.widthOfTextAtSize(s, style.size);
    return wrapText(this.fonts.safe(text), this.width - (style.indent ?? 0), measure);
  }

  /**
   * Vypíše text (zalomený). `keepWithNext` = kolik bodů za textem musí ještě zbýt
   * na stejné stránce (nadpis nezůstane osamocený dole).
   */
  text(text: string, style: TextStyle, keepWithNext = 0): void {
    const lines = this.lines(text, style);
    const indent = style.indent ?? 0;
    // krátké bloky (do 3 řádků) nedělit mezi stránky
    if (lines.length <= 3) this.ensure(lines.length * style.leading + keepWithNext);
    lines.forEach((line) => {
      this.ensure(style.leading);
      this.y -= style.leading;
      const w = style.font.widthOfTextAtSize(line, style.size);
      let x = this.margins.left + indent;
      if (style.align === "center") x = this.margins.left + (this.width - w) / 2;
      if (style.align === "right") x = A4.width - this.margins.right - w;
      // účaří ~ 0,25 výšky řádku nad spodní hranou řádku
      this.page.drawText(line, {
        x,
        y: this.y + (style.leading - style.size) / 2 + style.size * 0.22,
        size: style.size,
        font: style.font,
        color: style.color ?? INK,
      });
    });
  }

  /** Text s návěštím v levém sloupci („(1)“, „a)“), další řádky zarovnané pod textem. */
  labelled(label: string, text: string, style: TextStyle, labelWidth: number): void {
    const indent = style.indent ?? 0;
    const lines = wrapText(this.fonts.safe(text), this.width - indent - labelWidth, (s) => style.font.widthOfTextAtSize(s, style.size));
    if (lines.length <= 3) this.ensure(lines.length * style.leading);
    lines.forEach((line, i) => {
      this.ensure(style.leading);
      this.y -= style.leading;
      const baseY = this.y + (style.leading - style.size) / 2 + style.size * 0.22;
      if (i === 0) {
        this.page.drawText(this.fonts.safe(label), {
          x: this.margins.left + indent,
          y: baseY,
          size: style.size,
          font: style.font,
          color: style.color ?? INK,
        });
      }
      this.page.drawText(line, {
        x: this.margins.left + indent + labelWidth,
        y: baseY,
        size: style.size,
        font: style.font,
        color: style.color ?? INK,
      });
    });
  }

  rule(thickness = 1, color = INK): void {
    this.page.drawLine({
      start: { x: this.margins.left, y: this.y },
      end: { x: A4.width - this.margins.right, y: this.y },
      thickness,
      color,
    });
  }
}

/** Patička „strana 1/3“ na všech stránkách (jen když je jich víc). */
export function drawPageNumbers(pages: PDFPage[], font: PDFFont, template: string, margins: Margins, extra?: string): void {
  pages.forEach((page, i) => {
    const size = 8;
    if (extra) {
      page.drawText(extra, { x: margins.left, y: margins.bottom / 2, size, font, color: INK_SECONDARY });
    }
    if (pages.length < 2) return;
    const label = template.replace("{n}", String(i + 1)).replace("{total}", String(pages.length));
    const w = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: A4.width - margins.right - w, y: margins.bottom / 2, size, font, color: INK_SECONDARY });
  });
}
