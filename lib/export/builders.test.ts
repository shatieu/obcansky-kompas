import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { composeLawFromCompass } from "@/lib/law";
import { loadLawContent } from "@/lib/law/load";
import { composeLetter } from "@/lib/letters";
import { loadLettersContent } from "@/lib/letters/load";

/**
 * PDF, DOCX a ZIP buildery. Potřebují pdf-lib, @pdf-lib/fontkit, docx a fflate; dokud nejsou
 * v package.json, testy se přeskočí (EXPORT_DEPS=1 je vynutí).
 */
function hasDeps(): boolean {
  if (process.env.EXPORT_DEPS === "1") return true;
  const req = createRequire(import.meta.url);
  try {
    for (const p of ["pdf-lib", "@pdf-lib/fontkit", "docx", "fflate"]) req.resolve(p);
    return true;
  } catch {
    return false;
  }
}

const law = composeLawFromCompass(
  { q1: 9.2, q2: "q2-opt1", q3: "q3-opt1", q4: "q4-opt1", q5: "q5-opt2", q6: "q6-opt2", q7: ["q7-opt1", "q7-opt2"], q8: "q8-opt2" },
  "test",
  { content: loadLawContent(), date: "28. 10. 2026", uuid: "00000000-0000-4000-8000-000000000001" },
);

const letter = composeLetter(
  {
    addressee: "ministr-kultury",
    statementSentences: ["Chci, aby Česká televize a Český rozhlas měly stabilní financování.", "Příliš žluťoučký kůň úpěl ďábelské ódy."],
    forma: 3,
    delka: 3,
    seed: "abc",
    includeProcessBlock: true,
    customSentence: "Vlastní věta se smajlíkem 🙂 a „uvozovkami“.",
    senderName: "Jana Nováková",
  },
  loadLettersContent(),
);

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe.skipIf(!hasDeps())("exporty (pdf-lib, docx, fflate)", () => {
  it("dopis → PDF A4 s vloženým písmem", async () => {
    const { buildLetterPdf } = await import("./letter-pdf");
    const { loadPdfFonts } = await import("./fonts");
    const bytes = await buildLetterPdf(
      {
        recipient: ["Ministr kultury", "Ministerstvo kultury", "Maltézské náměstí 1", "118 00 Praha 1"],
        sender: ["Jana Nováková", "Dlouhá 1, 110 00 Praha 1"],
        date: "28. 10. 2026",
        subject: "Věc: Financování České televize a Českého rozhlasu",
        body: letter.text,
        title: "Dopis – Ministr kultury",
        creator: "Občanský kompas",
        pageLabel: "Strana {n} z {total}",
      },
      await loadPdfFonts(),
    );
    expect(latin1(bytes.subarray(0, 5))).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    // vložené TrueType písmo (FontDescriptor s /FontFile2)
    const { PDFDict, PDFName } = await import("pdf-lib");
    const embedded = doc.context
      .enumerateIndirectObjects()
      .some(([, obj]) => obj instanceof PDFDict && obj.has(PDFName.of("FontFile2")));
    expect(embedded).toBe(true);
    expect(doc.getTitle()).toBe("Dopis – Ministr kultury");
  });

  it("dlouhý dopis přeteče na další stránku", async () => {
    const { buildLetterPdf } = await import("./letter-pdf");
    const { loadPdfFonts } = await import("./fonts");
    const { PDFDocument } = await import("pdf-lib");
    const body = Array.from({ length: 30 }, (_, i) => `Odstavec ${i + 1}. ${"Text dopisu s diakritikou ěščřžýáíé. ".repeat(4)}`).join("\n\n");
    const bytes = await buildLetterPdf(
      { recipient: ["A"], sender: [], date: "1. 1. 2026", subject: null, body, title: "t", creator: "c", pageLabel: "{n}/{total}" },
      await loadPdfFonts(),
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("zákon → PDF", async () => {
    const { buildLawPdf } = await import("./law-pdf");
    const { loadPdfFonts } = await import("./fonts");
    const { PDFDocument } = await import("pdf-lib");
    const bytes = await buildLawPdf(law, await loadPdfFonts(), { creator: "Občanský kompas", pageLabel: "Strana {n} z {total}" });
    expect(latin1(bytes.subarray(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("zákon → DOCX (ZIP s word/document.xml a textem zákona)", async () => {
    const { buildLawDocx } = await import("./law-docx");
    const { unzipSync, strFromU8 } = await import("fflate");
    const bytes = await buildLawDocx(law, { creator: "Občanský kompas", pageLabel: "Strana {n} z {total}" });
    expect(latin1(bytes.subarray(0, 2))).toBe("PK");
    const files = unzipSync(bytes);
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain(law.disclaimer);
    expect(xml).toContain(law.heading[2]!);
    if (law.workingDraftLabel) expect(xml).toContain(law.workingDraftLabel.toUpperCase());
    expect(xml).toContain(law.parts[0]!.paragraphs[0]!.label);
  });

  it("ZIP s jedinečnými názvy", async () => {
    const { buildZip } = await import("./zip");
    const { unzipSync } = await import("fflate");
    const z = buildZip([
      { name: "a.pdf", data: new Uint8Array([1, 2, 3]) },
      { name: "a.pdf", data: new Uint8Array([4]) },
    ]);
    const out = unzipSync(z);
    expect(Object.keys(out).sort()).toEqual(["a-2.pdf", "a.pdf"]);
    expect([...out["a.pdf"]!]).toEqual([1, 2, 3]);
  });
});
