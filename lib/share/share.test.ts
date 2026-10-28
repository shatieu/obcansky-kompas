import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { questionsFile } from "@/lib/content";
import { ADDRESSEE_TYPES as LETTER_TYPES } from "@/lib/letters/schema";
import type { StatsResult } from "@/lib/stats/aggregate";
import { emptyQuestions } from "@/lib/stats/aggregate";
import { compare } from "@/lib/stats/compare";
import { dopisyCard, fotkaCard, podpisCard, srovnaniCard, zakonCard, cardShareText } from "./card";
import { answerKeyLabel, questionRows } from "./compare-view";
import { layoutCard, type DrawOp } from "./layout";
import {
  ADDRESSEE_TYPES,
  formatRecipients,
  isMoment,
  MOMENTS,
  networkUrl,
  NETWORKS,
  ogImagePath,
  parseRecipients,
  plural,
  recipientLines,
  shareSentence,
  shortHash,
  withMoment,
} from "./moments";
import { shareTextsSchema } from "./texts";
import { wrapText } from "./wrap";

const uiRaw = parse(readFileSync(path.join(process.cwd(), "content", "ui.yaml"), "utf8"));
const texts = shareTextsSchema.parse({ share: uiRaw.share, compare_page: uiRaw.compare_page });
const img = texts.share.image;
const forms = texts.share.recipients;

const answers = { q1: 9.5, q2: "q2-opt1", q3: "q3-opt3", q4: questionsFile.questions.find((q) => q.id === "q4")!.options[0]!.id };

describe("moments", () => {
  it("mají větu v content/share.yaml", () => {
    for (const m of MOMENTS) expect(shareSentence(m, { percent: 42 }).length).toBeGreaterThan(5);
    expect(shareSentence("srovnani", { percent: 42 })).toContain("42 %");
  });
  it("isMoment", () => {
    expect(isMoment("podpis")).toBe(true);
    expect(isMoment("strany")).toBe(false);
    expect(isMoment(undefined)).toBe(false);
  });
  it("withMoment nastaví ?s= a zachová ostatní", () => {
    expect(withMoment("https://x.cz/v/abc?a=1#h", "podpis")).toBe("https://x.cz/v/abc?a=1&s=podpis");
    expect(withMoment("https://x.cz/v/abc?s=zakon", "srovnani")).toBe("https://x.cz/v/abc?s=srovnani");
  });
  it("ogImagePath", () => {
    expect(ogImagePath("fotka")).toBe("/api/og/fotka");
    expect(ogImagePath("podpis", { id: "u", v: "h" })).toBe("/api/og/podpis?id=u&v=h");
  });
  it("typy adresátů odpovídají lib/letters", () => {
    expect([...ADDRESSEE_TYPES]).toEqual([...LETTER_TYPES]);
  });
});

describe("dopisy", () => {
  it("parse/format jsou inverzní a zahodí nesmysly", () => {
    const c = parseRecipients("senator:1,poslanec:3,hacker:5,obec:0,kraj:abc,prezident:1000");
    expect(c).toEqual({ senator: 1, poslanec: 3, prezident: 99 });
    expect(formatRecipients(c)).toBe("poslanec:3,senator:1,prezident:99");
    expect(parseRecipients(formatRecipients(c))).toEqual(c);
    expect(parseRecipients(null)).toEqual({});
  });
  it("české tvary", () => {
    const f = ["poslanec", "poslanci", "poslanců"] as const;
    expect([1, 2, 4, 5, 11, 0].map((n) => plural(n, f))).toEqual(["poslanec", "poslanci", "poslanci", "poslanců", "poslanců", "poslanců"]);
    expect(recipientLines({ poslanec: 3, senator: 1 }, forms)).toEqual(["3 poslanci", "1 senátor"]);
  });
});

describe("sítě", () => {
  it("jen obyčejné odkazy s kódovaným URL", () => {
    const url = "https://kompas.example/v/1?s=podpis";
    for (const n of NETWORKS) {
      const href = networkUrl(n, url, "Vím, jak & co");
      expect(href.startsWith("https://") || href.startsWith("mailto:")).toBe(true);
      expect(href).toContain(encodeURIComponent(url).slice(0, 20));
      expect(href).not.toContain(" ");
    }
  });
});

describe("karty", () => {
  it("podpis: 3 klíčové volby Q2–Q4, jméno jen když je předané", () => {
    const c = podpisCard(answers, questionsFile, img, null);
    expect(c.items.map((i) => i.label)).toEqual([
      "Poplatek jako dnes",
      "Nezávislá komise na několik let",
      questionsFile.questions.find((q) => q.id === "q4")!.options[0]!.label,
    ]);
    expect(c.items[0]!.caption).toBe("Odkud peníze");
    expect(c.name).toBeNull();
    expect(podpisCard(answers, questionsFile, img, "Jana").name).toBe("Jana");
    expect(podpisCard({}, questionsFile, img, null).items).toEqual([]);
  });
  it("zákon: Můj zákon + hlavní volba (bez Nevím)", () => {
    const c = zakonCard({ ...answers, q2: "q2-nevim" }, questionsFile, img, null);
    expect(c.headline).toBe("Můj zákon");
    expect(c.items).toHaveLength(1);
    expect(c.items[0]!.label).toBe("Nezávislá komise na několik let");
    expect(cardShareText(c)).toBe(shareSentence("zakon"));
  });
  it("dopisy, fotka, srovnání", () => {
    expect(dopisyCard({ obec: 1 }, img, forms).items.map((i) => i.label)).toEqual(["1 zastupitelstvo obce"]);
    expect(dopisyCard({}, img, forms).items[0]!.label).toBe(img.letters_none);
    expect(fotkaCard(img).items).toEqual([]);
    const s = srovnaniCard(63.6, img);
    expect(s.big).toBe("64 %");
    expect(s.headline).toContain("64 %");
    expect(srovnaniCard(null, img).big).toBeNull();
  });
});

function stats(): StatsResult {
  const questions = emptyQuestions();
  questions.q2 = { total: 10, counts: { "q2-opt1": 4, "q2-opt2": 6 } };
  questions.q3 = { total: 10, counts: { "q3-opt3": 5, "q3-nevim": 5 } };
  return { generatedAt: "", demo: true, source: "snapshot", filters: {}, verified: 10, pending: 0, questions, q7Sets: {}, topCombos: [] };
}

describe("srovnání – popisky", () => {
  it("Q1 pásmo, Q7 sada", () => {
    expect(answerKeyLabel(questionsFile, "q1", "gov")).toBe("Návrh vlády");
    expect(answerKeyLabel(questionsFile, "q2", "q2-opt1")).toBe("Poplatek jako dnes");
  });
  it("řádky otázek", () => {
    const cmp = compare({ answers, stats: stats(), organizations: [], questionsFile, thresholds: null });
    const rows = questionRows(cmp, questionsFile, new Set(["q5"]));
    const q2 = rows.find((r) => r.questionId === "q2")!;
    expect(q2).toMatchObject({ state: "compared", percent: 40, answer: "Poplatek jako dnes" });
    expect(rows.find((r) => r.questionId === "q5")!.state).toBe("skipped");
    expect(rows.find((r) => r.questionId === "q8")!.state).toBe("no_answer");
  });
});

describe("wrapText", () => {
  const m = (s: string) => s.length * 10;
  it("zalomí podle šířky a drží nezlomitelnou mezeru", () => {
    expect(wrapText("aaa bbb ccc", 75, m)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapText("12 % lidí", 40, m)).toEqual(["12 %", "lidí"]);
  });
  it("omezí počet řádků trojtečkou", () => {
    const out = wrapText("a b c d e f", 30, m, 2);
    expect(out).toHaveLength(2);
    expect(out[1]!.endsWith("…")).toBe(true);
  });
});

describe("layout Story a čtverce", () => {
  const measure = (s: string, _f: string, size: number) => s.length * size * 0.62;
  const sizes = { story: [1080, 1920], square: [1080, 1080] } as const;
  const long = podpisCard(
    { ...answers },
    questionsFile,
    { ...img },
    "Jana Nováková-Dlouhé-Příjmení s velmi dlouhým jménem, které se nevejde",
  );
  const cards = [long, zakonCard(answers, questionsFile, img, null), dopisyCard(parseRecipients("poslanec:12,senator:1,kraj:1,obec:1,ministr-kultury:1,prezident:1"), img, forms), fotkaCard(img), srovnaniCard(51, img)];
  for (const format of ["story", "square"] as const) {
    it(`${format}: vše uvnitř plochy, vlajka 3:2 sama`, () => {
      const [W, H] = sizes[format];
      for (const card of cards) {
        const ops = layoutCard(card, format, measure);
        const flag = ops.find((o): o is Extract<DrawOp, { t: "flag" }> => o.t === "flag")!;
        const fh = (flag.w * 2) / 3;
        const clear = fh / 4;
        for (const op of ops) {
          if (op.t === "text") {
            const w = measure(op.text, op.font, op.size);
            const x0 = op.align === "right" ? op.x - w : op.align === "center" ? op.x - w / 2 : op.x;
            expect(x0).toBeGreaterThanOrEqual(0);
            expect(x0 + w).toBeLessThanOrEqual(W + 1);
            expect(op.y).toBeLessThanOrEqual(H);
            // Nic přes vlajku ani do jejího volného okolí.
            const top = op.y - op.size;
            const overlapsX = x0 < flag.x + flag.w + clear && x0 + w > flag.x - clear;
            const overlapsY = top < flag.y + fh + clear && op.y > flag.y - clear;
            expect(overlapsX && overlapsY, `${card.moment} ${format}: „${op.text}“ zasahuje do vlajky`).toBe(false);
          }
          if (op.t === "rect" && op.w < W) {
            expect(op.y + op.h).toBeLessThanOrEqual(H);
          }
        }
      }
    });
  }
});

describe("cache-buster", () => {
  it("stabilní a citlivý na změnu", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });
});
