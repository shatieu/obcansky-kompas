import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { questionsFile, sentencesFile } from "@/lib/content";
import { questionsFileSchema, sentencesFileSchema } from "@/lib/content/schemas";
import { applyAnswer, emptyState } from "@/lib/compass-storage";
import { composeWith } from "./core";
import { currentBundle } from "./current";
import { evaluate } from "./engine";
import { composeStatement, currentContentVersion, QUESTION_ORDER, questionNumber, registeredVersions, type Answers } from "./index";
import { QUESTION_IDS, type QuestionId } from "./types";

const V = currentContentVersion();
const optionsOf = (qid: QuestionId) => questionsFile.questions.find((q) => q.id === qid)!.options.map((o) => o.id);

describe("pořadí otázek (questions.yaml `order`)", () => {
  it("obsahuje každou otázku právě jednou a otázka na peníze není první, ale poslední", () => {
    expect([...QUESTION_ORDER].sort()).toEqual([...QUESTION_IDS]);
    expect(QUESTION_ORDER[0]).not.toBe("q1");
    expect(QUESTION_ORDER.at(-1)).toBe("q1");
    expect(questionNumber("q2")).toBe(1);
    expect(questionNumber("q1")).toBe(8);
  });

  it("schéma odmítne pořadí s chybějící nebo zdvojenou otázkou", () => {
    const bad = { ...questionsFile, order: ["q2", "q2", "q3", "q4", "q5", "q6", "q7", "q8"] };
    expect(questionsFileSchema.safeParse(bad).success).toBe(false);
    expect(questionsFileSchema.safeParse(questionsFile).success).toBe(true);
  });

  it("text se skládá v pořadí zobrazení, větvení se počítá podle id (q2 před q3…)", () => {
    const s = composeStatement({ q1: 8.5, q2: "q2-opt1", q3: "q3-opt1", q8: "q8-opt2" }, V);
    expect(s.parts.map((p) => p.questionId)).toEqual([null, "q2", "q3", "q8", "q1", null]);
  });
});

describe("věty (sentences.yaml)", () => {
  it("YAML bez neuvozovkovaných čárek: soubor projde striktním schématem bez zbylých klíčů", () => {
    const raw = parse(readFileSync(path.join(process.cwd(), "content/sentences.yaml"), "utf8"));
    expect(sentencesFileSchema.safeParse(raw).success).toBe(true);
    for (const o of Object.values(raw.options as Record<string, object>))
      expect(Object.keys(o).every((k) => ["version", "text", "fragment"].includes(k))).toBe(true);
    // Kontrola, že strict opravdu chytí utnutou větu.
    const broken = parse("options:\n  x: { version: 1, text: A, B. }\n").options;
    expect(sentencesFileSchema.shape.options.safeParse(broken).success).toBe(false);
  });

  it("každá složená věta končí interpunkcí (žádný utnutý text)", () => {
    let n = 0;
    for (const q1 of [5, 7.8, 8.5, 9.2, 12, "q1-nevim"] as const)
      for (const q2 of optionsOf("q2"))
        for (const q3 of optionsOf("q3"))
          for (const q4 of optionsOf("q4"))
            for (const q5 of optionsOf("q5"))
              for (const q6 of optionsOf("q6")) {
                const q8 = optionsOf("q8")[n % optionsOf("q8").length]!;
                const q7 = n % 3 === 0 ? ["q7-opt1", "q7-opt3"] : [optionsOf("q7")[n % optionsOf("q7").length]!];
                const s = composeStatement({ q1, q2, q3, q4, q5, q6, q7, q8 }, V);
                for (const p of s.parts) if (!/[.!?]$/.test(p.text)) throw new Error(`${p.sentenceId}: ${p.text}`);
                n++;
              }
    expect(n).toBeGreaterThan(1000);
  });

  it("volby mají 2–3 věty a volby jedné otázky mají podobnou délku (neutralita)", () => {
    const byQ = new Map<string, number[]>();
    for (const [id, o] of Object.entries(sentencesFile.options)) {
      if (!o.text) continue;
      const sentences = o.text.split(/(?<=[.!?])\s+/).length;
      expect(sentences, id).toBeGreaterThanOrEqual(2);
      expect(sentences, id).toBeLessThanOrEqual(3);
      const q = id.split("-")[0]!;
      byQ.set(q, [...(byQ.get(q) ?? []), o.text.length]);
    }
    for (const [q, lens] of byQ) if (lens.length > 1) expect(Math.max(...lens) / Math.min(...lens), q).toBeLessThan(1.35);
  });
});

describe("rekonstrukce starých verzí (content_version)", () => {
  it("2026-10-28.1 je registrovaná a skládá přesně tehdejší text (q1 první, utnuté věty)", () => {
    expect(registeredVersions()).toContain("2026-10-28.1");
    expect(V).not.toBe("2026-10-28.1");
    const answers: Answers = { q1: 8.5, q2: "q2-opt3", q3: "q3-opt1", q5: "q5-opt1" };
    const old = composeStatement(answers, "2026-10-28.1");
    expect(old.contentVersion).toBe("2026-10-28.1");
    expect(old.parts.map((p) => p.questionId)).toEqual([null, "q1", "q2", "q3", "q4", "q8", null]);
    expect(old.text).toBe(
      "Takhle si představuji financování České televize a Českého rozhlasu. " +
        "ČT a ČRo mají ročně dostat asi 8,5 miliardy Kč, víc než v návrhu vlády, ale méně než dnes. " +
        "Peníze mají jít ze státního rozpočtu " +
        "Výši peněz má určit zákon a má růst podle inflace. " +
        "Nikdo nemá platit zvlášť " +
        "Firmy nemají platit. " +
        "Žádám, aby zákonodárci můj názor vzali v úvahu.",
    );
    const now = composeStatement(answers, V);
    expect(now.text).not.toBe(old.text);
    expect(now.parts.at(-2)!.questionId).toBe("q1");
  });
});

describe("přehled odpovědí: změna na místě + větvení živě (SPEC §5.2)", () => {
  it("změna dřívější volby zruší neplatné pozdější odpovědi, zvýrazní je a text se hned přeskládá", () => {
    let s = emptyState();
    for (const [qid, v] of [
      ["q2", "q2-opt1"],
      ["q3", "q3-opt2"],
      ["q4", "q4-opt2"],
      ["q5", "q5-opt2"],
      ["q1", 9.2],
    ] as const)
      s = applyAnswer(s, qid, v);
    expect(s.invalidated).toEqual([]);
    const before = composeWith(currentBundle, s.answers);

    // V přehledu změním Q2 na „Státní rozpočet s pojistkami“: Q3 „Vláda a poslanci“ zašedne, Q4 je jen „Nikdo zvlášť“, Q5 odpadá.
    s = applyAnswer(s, "q2", "q2-opt3");
    expect(s.invalidated).toEqual(["q3", "q4", "q5"]);
    expect(s.answers).toEqual({ q1: 9.2, q2: "q2-opt3" });
    const ev = evaluate(s.answers, questionsFile);
    expect(ev.states.q5.status).toBe("skipped");
    expect(ev.effective.q4).toBe("q4-opt3");
    const after = composeWith(currentBundle, s.answers);
    expect(after.text).not.toBe(before.text);
    expect(after.parts.map((p) => p.sentenceId)).toEqual(["intro", "q2-opt3", "q4-opt3", "q8-opt1", "q1-today", "outro"]);

    // Nová odpověď na zvýrazněnou otázku zvýraznění zruší, ostatní zůstanou.
    s = applyAnswer(s, "q3", "q3-opt3");
    expect(s.invalidated).toEqual(["q4", "q5"]);
    expect(composeWith(currentBundle, s.answers).parts.map((p) => p.questionId)).toEqual([null, "q2", "q3", "q4", "q8", "q1", null]);
  });
});
