import type { LawDocument } from "@/lib/law";
import { Flow, INK, INK_SECONDARY, MM, createPdf, drawPageNumbers, type Margins, type PdfFontBytes } from "./pdf-common";
import { lawMetaLines } from "./law-meta";

/** „Můj zákon“ jako PDF A4 (SPEC §10). Text je dlouhý – na obrazovce je jen přehled. */

export interface LawPdfOptions {
  creator: string;
  /** „Strana {n} z {total}“ */
  pageLabel: string;
}

const MARGINS: Margins = { top: 22 * MM, bottom: 22 * MM, left: 25 * MM, right: 25 * MM };

export async function buildLawPdf(law: LawDocument, fontBytes: PdfFontBytes, opts: LawPdfOptions): Promise<Uint8Array> {
  const { doc, fonts } = await createPdf(fontBytes, {
    title: `${law.header.title} – ${law.header.lawTitle}`,
    subject: law.disclaimer,
    creator: opts.creator,
  });
  const { regular, bold } = fonts;
  const flow = new Flow(doc, fonts, MARGINS);

  // Štítek pracovní verze v rámečku (výrazně) + upozornění vždy.
  if (law.workingDraftLabel) {
    const label = law.workingDraftLabel.toUpperCase();
    const h = 26;
    flow.ensure(h);
    flow.page.drawRectangle({
      x: MARGINS.left,
      y: flow.y - h,
      width: flow.width,
      height: h,
      borderColor: INK,
      borderWidth: 2,
    });
    flow.page.drawText(fonts.safe(label), { x: MARGINS.left + 10, y: flow.y - h + 9, size: 11, font: bold, color: INK });
    flow.gap(h + 8);
  }
  flow.text(law.disclaimer, { font: bold, size: 10, leading: 14 });
  flow.gap(6);
  for (const line of lawMetaLines(law)) flow.text(line, { font: regular, size: 8.5, leading: 12, color: INK_SECONDARY });
  flow.gap(10);
  flow.rule(1);
  flow.gap(18);

  // Záhlaví zákona.
  law.heading.forEach((line, i) => {
    flow.text(line, { font: bold, size: i === 0 ? 14 : 11.5, leading: i === 0 ? 20 : 16, align: "center" });
  });
  flow.gap(10);
  flow.text(law.enactingFormula, { font: regular, size: 11, leading: 15.5 });

  const body = { font: regular, size: 11, leading: 15.5 };
  for (const part of law.parts) {
    flow.gap(16);
    flow.text(part.label, { font: bold, size: 11.5, leading: 16, align: "center" }, 60);
    flow.text(part.title.toUpperCase(), { font: bold, size: 11.5, leading: 16, align: "center" }, 50);
    for (const p of part.paragraphs) {
      flow.gap(12);
      flow.text(p.label, { font: bold, size: 11, leading: 15.5, align: "center" }, 40);
      if (p.title) flow.text(p.title, { font: bold, size: 11, leading: 15.5, align: "center" }, 30);
      flow.gap(4);
      for (const s of p.subsections) {
        if (s.label) flow.labelled(s.label, s.text, body, 9 * MM);
        else flow.text(s.text, body);
        for (const pt of s.points) flow.labelled(pt.label, pt.text, { ...body, indent: s.label ? 9 * MM : 0 }, 7 * MM);
        flow.gap(4);
      }
    }
  }

  drawPageNumbers(flow.pages, regular, opts.pageLabel, MARGINS, fonts.safe(law.disclaimer));
  return doc.save();
}
