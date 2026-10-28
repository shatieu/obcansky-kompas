import { A4, Flow, INK_SECONDARY, MM, createPdf, drawPageNumbers, type Margins, type PdfFontBytes } from "./pdf-common";
import { splitParagraphs } from "./text";

/**
 * Dopis jako PDF A4 pro obálku DL s okénkem vlevo (SPEC §9.2).
 *
 * Okénko DL: 90 × 45 mm, 20 mm zleva, 15 mm zdola obálky (110 mm) → na listu
 * (přeloženém na třetiny po 99 mm) leží adresní pole cca 45–90 mm shora a 20–110 mm zleva.
 * Adresa adresáta se tiskne dovnitř s 5mm rezervou. Značky pro přeložení u levého okraje.
 */

export interface LetterPdfInput {
  /** Řádky adresy adresáta (první = jméno / orgán). */
  recipient: string[];
  /** Volitelné řádky odesílatele (jméno, adresa) – jen v prohlížeči. */
  sender: string[];
  /** „28. 10. 2026“ */
  date: string;
  /** „Věc: …“ nebo null */
  subject: string | null;
  /** Celý text dopisu (odstavce oddělené prázdným řádkem, \n = nový řádek). */
  body: string;
  /** Metadata PDF. */
  title: string;
  creator: string;
  /** „Strana {n} z {total}“ */
  pageLabel: string;
}

/** Rozměry adresního pole – exportováno kvůli testům. */
export const WINDOW = { left: 20 * MM, top: 45 * MM, width: 90 * MM, height: 45 * MM } as const;
const PADDING = 5 * MM;
const MARGINS: Margins = { top: 25 * MM, bottom: 22 * MM, left: 25 * MM, right: 20 * MM };

export async function buildLetterPdf(input: LetterPdfInput, fontBytes: PdfFontBytes): Promise<Uint8Array> {
  const { doc, fonts } = await createPdf(fontBytes, { title: input.title, subject: input.subject ?? undefined, creator: input.creator });
  const { regular, bold, safe } = fonts;

  // Tělo začíná pod adresním polem.
  const flow = new Flow(doc, fonts, MARGINS, 100 * MM);
  const page = flow.page;

  // Odesílatel – nad okénkem (do okénka nepatří).
  let sy = A4.height - 16 * MM;
  for (const line of input.sender.slice(0, 4)) {
    page.drawText(safe(line), { x: MARGINS.left, y: sy, size: 9, font: regular, color: INK_SECONDARY });
    sy -= 11;
  }

  // Adresát – uvnitř okénka. Řádky, které se nevejdou na šířku, se zmenší.
  const maxW = WINDOW.width - 2 * PADDING;
  let ay = A4.height - WINDOW.top - PADDING - 11;
  input.recipient.slice(0, 6).forEach((raw, i) => {
    const line = safe(raw);
    const font = i === 0 ? bold : regular;
    let size = 11;
    while (size > 7 && font.widthOfTextAtSize(line, size) > maxW) size -= 0.5;
    page.drawText(line, { x: WINDOW.left + PADDING, y: ay, size, font });
    ay -= 14;
  });

  // Značky pro přeložení na třetiny (99 a 198 mm) a středová děrovací značka.
  for (const mm of [99, 198]) {
    const y = A4.height - mm * MM;
    page.drawLine({ start: { x: 4 * MM, y }, end: { x: 9 * MM, y }, thickness: 0.5, color: INK_SECONDARY });
  }
  page.drawLine({
    start: { x: 4 * MM, y: A4.height / 2 },
    end: { x: 7 * MM, y: A4.height / 2 },
    thickness: 0.5,
    color: INK_SECONDARY,
  });

  // Datum vpravo, věc tučně.
  flow.text(input.date, { font: regular, size: 11, leading: 15, align: "right" });
  flow.gap(10);
  if (input.subject) {
    flow.text(input.subject, { font: bold, size: 11, leading: 15 });
    flow.gap(12);
  }

  const body = { font: regular, size: 11, leading: 15.5 };
  for (const para of splitParagraphs(input.body)) {
    flow.text(para, body);
    flow.gap(8);
  }

  drawPageNumbers(flow.pages, regular, input.pageLabel, MARGINS);
  return doc.save();
}
