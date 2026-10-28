import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  type IParagraphOptions,
} from "docx";
import type { LawDocument } from "@/lib/law";
import { lawMetaLines } from "./law-meta";

/** „Můj zákon“ jako DOCX (SPEC §10). Načítá se jen dynamicky po kliknutí. */

export interface LawDocxOptions {
  creator: string;
  /** „Strana {n} z {total}“ */
  pageLabel: string;
}

const INK = "0B1B33";
const SECONDARY = "454E5D";
const MM = 56.7; // twips na mm

type Run = { text: string; bold?: boolean; size?: number; color?: string };

function para(runs: Run[] | string, opts: Omit<IParagraphOptions, "children" | "text"> = {}): Paragraph {
  const list: Run[] = typeof runs === "string" ? [{ text: runs }] : runs;
  return new Paragraph({
    ...opts,
    children: list.map((r) => new TextRun({ text: r.text, bold: r.bold, size: r.size, color: r.color ?? INK })),
  });
}

/** „Strana {n} z {total}“ → běhy s poli pro číslo stránky. */
function pageNumberRuns(template: string): TextRun[] {
  const out: TextRun[] = [];
  const re = /\{(n|total)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) out.push(new TextRun({ text: template.slice(last, m.index), size: 16, color: SECONDARY }));
    out.push(new TextRun({ children: [m[1] === "n" ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES], size: 16, color: SECONDARY }));
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(new TextRun({ text: template.slice(last), size: 16, color: SECONDARY }));
  return out;
}

export function lawDocxDocument(law: LawDocument, opts: LawDocxOptions): Document {
  const children: Paragraph[] = [];
  const box = { style: BorderStyle.SINGLE, size: 16, color: INK, space: 4 };

  if (law.workingDraftLabel) {
    children.push(
      para([{ text: law.workingDraftLabel.toUpperCase(), bold: true }], {
        border: { top: box, bottom: box, left: box, right: box },
        spacing: { after: 160 },
      }),
    );
  }
  children.push(para([{ text: law.disclaimer, bold: true }], { spacing: { after: 120 } }));
  for (const line of lawMetaLines(law)) children.push(para([{ text: line, size: 17, color: SECONDARY }]));
  children.push(para("", { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 1 } }, spacing: { after: 360 } }));

  law.heading.forEach((line, i) =>
    children.push(para([{ text: line, bold: true, size: i === 0 ? 28 : 23 }], { alignment: AlignmentType.CENTER })),
  );
  children.push(para(law.enactingFormula, { spacing: { before: 240, after: 120 } }));

  for (const part of law.parts) {
    children.push(para([{ text: part.label, bold: true }], { alignment: AlignmentType.CENTER, spacing: { before: 360 }, keepNext: true }));
    children.push(para([{ text: part.title.toUpperCase(), bold: true }], { alignment: AlignmentType.CENTER, keepNext: true }));
    for (const p of part.paragraphs) {
      children.push(para([{ text: p.label, bold: true }], { alignment: AlignmentType.CENTER, spacing: { before: 240 }, keepNext: true }));
      if (p.title) children.push(para([{ text: p.title, bold: true }], { alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 80 } }));
      for (const s of p.subsections) {
        const text = s.label ? `${s.label}\t${s.text}` : s.text;
        children.push(
          para(text, {
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 80 },
            indent: s.label ? { left: 9 * MM, hanging: 9 * MM } : undefined,
            tabStops: s.label ? [{ type: "left", position: 9 * MM }] : undefined,
          }),
        );
        const base = s.label ? 9 * MM : 0;
        for (const pt of s.points) {
          children.push(
            para(`${pt.label}\t${pt.text}`, {
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 40 },
              indent: { left: base + 7 * MM, hanging: 7 * MM },
              tabStops: [{ type: "left", position: base + 7 * MM }],
            }),
          );
        }
      }
    }
  }

  return new Document({
    creator: opts.creator,
    title: `${law.header.title} – ${law.header.lawTitle}`,
    description: law.disclaimer,
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22, color: INK, language: { value: "cs-CZ" } }, paragraph: { spacing: { line: 300 } } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 22 * MM, bottom: 22 * MM, left: 25 * MM, right: 25 * MM } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({ children: [new TextRun({ text: law.disclaimer, size: 16, color: SECONDARY })] }),
              new Paragraph({ alignment: AlignmentType.RIGHT, children: pageNumberRuns(opts.pageLabel) }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function buildLawDocx(law: LawDocument, opts: LawDocxOptions): Promise<Uint8Array> {
  const buf = await Packer.toArrayBuffer(lawDocxDocument(law, opts));
  return new Uint8Array(buf);
}
