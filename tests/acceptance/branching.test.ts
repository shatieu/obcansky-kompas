/**
 * SPEC §5.2 – větvení. Očekávání jsou přepsaná přímo z tabulky ve SPEC; volby se hledají
 * podle textu ze SPEC §5.1, ne podle id. Testuje veřejnou funkci `evaluate` (pravidla jsou data
 * v questions.yaml – SPEC: „Pravidla jsou v questions.yaml jako data“).
 */
import { describe, expect, it } from "vitest";
import { questionsFile } from "@/lib/content";
import { evaluate } from "@/lib/compose";
import type { Answers, QuestionId } from "@/lib/compose/types";
import { optionIdByLabel, questionsYaml, readYaml } from "./helpers/content";

const file = questionsYaml();
const id = (qid: string, label: string) => optionIdByLabel(qid, label, file);
const all = (qid: string) => file.questions.find((q) => q.id === qid)!.options.map((o) => o.id);
const LATER: QuestionId[] = ["q3", "q4", "q5", "q6", "q7", "q8"];

/** Množina povolených voleb, nebo "skip" (celá otázka zašedne). */
type Allowed = string[] | "skip";
interface Row {
  allowed: Record<string, Allowed>;
  /** Předvyplněná volba (když je povolená jediná). */
  prefilled: Partial<Record<QuestionId, string>>;
}

const ALL: Row = { allowed: Object.fromEntries(LATER.map((x) => [x, all(x)])), prefilled: {} };
// „jako 3“: Q4 jen „Nikdo zvlášť“, zbytek Q4–Q7 zašedne; Q8 jen „Ne“.
const Q4_Q8_LIKE_3 = {
  q4: [id("q4", "Nikdo zvlášť, ze všech daní")],
  q5: "skip" as const,
  q6: "skip" as const,
  q7: "skip" as const,
  q8: [id("q8", "Ne")],
};

const TABLE: Record<string, Row> = {
  "Poplatek jako dnes": ALL,
  "Zvláštní poplatek přes daně": ALL,
  "Státní rozpočet s pojistkami": {
    allowed: { q3: all("q3").filter((o) => o !== id("q3", "Vláda a poslanci každý rok")), ...Q4_Q8_LIKE_3 },
    prefilled: { q4: id("q4", "Nikdo zvlášť, ze všech daní"), q8: id("q8", "Ne") },
  },
  "Návrh vlády": {
    allowed: { q3: [id("q3", "Zákon, s růstem podle inflace")], ...Q4_Q8_LIKE_3 },
    prefilled: { q3: id("q3", "Zákon, s růstem podle inflace"), q4: id("q4", "Nikdo zvlášť, ze všech daní"), q8: id("q8", "Ne") },
  },
  "Státní rozpočet bez pojistek": {
    allowed: { q3: [id("q3", "Vláda a poslanci každý rok")], ...Q4_Q8_LIKE_3 },
    prefilled: { q3: id("q3", "Vláda a poslanci každý rok"), q4: id("q4", "Nikdo zvlášť, ze všech daní"), q8: id("q8", "Ne") },
  },
  "Jen dobrovolné příspěvky": { allowed: Object.fromEntries(LATER.map((x) => [x, "skip"])), prefilled: {} },
  Nevím: ALL,
};

describe("§5.2 tabulka větvení – stav každé pozdější otázky", () => {
  it("tabulka pokrývá všech 7 voleb Q2", () => {
    expect(Object.keys(TABLE).map((l) => id("q2", l)).sort()).toEqual(all("q2").sort());
  });
  it("bez odpovědi na Q2 je vše otevřené", () => {
    const ev = evaluate({}, questionsFile);
    for (const qid of LATER) {
      expect(ev.states[qid].status).toBe("open");
      expect(Object.keys(ev.states[qid].disabled)).toHaveLength(0);
    }
  });

  for (const [q2Label, row] of Object.entries(TABLE)) {
    for (const qid of LATER) {
      const allowed = row.allowed[qid]!;
      it(`Q2 „${q2Label}“ → ${qid}: ${allowed === "skip" ? "celá zašedne" : `povoleno ${allowed.length}`}`, () => {
        const ev = evaluate({ q2: id("q2", q2Label) }, questionsFile);
        const st = ev.states[qid];
        if (allowed === "skip") {
          expect(st.status).toBe("skipped");
          // Uživatel vždy vidí všechny volby – všechny jsou zašedlé, s důvodem.
          expect(Object.keys(st.disabled).sort()).toEqual(all(qid).sort());
          expect(ev.effective[qid]).toBeUndefined();
          return;
        }
        expect(st.status).toBe("open");
        const enabled = all(qid).filter((o) => !st.disabled[o]);
        expect(enabled.sort()).toEqual([...allowed].sort());
        for (const cause of Object.values(st.disabled)) expect(cause.option).toBe(id("q2", q2Label));
        const pre = row.prefilled[qid];
        if (pre) expect(ev.effective[qid]).toEqual(qid === "q7" ? [pre] : pre);
        else expect(ev.effective[qid]).toBeUndefined();
      });
    }
  }
});

describe("§5.2 všechny kombinace Q2 × volba pozdější otázky", () => {
  for (const [q2Label, row] of Object.entries(TABLE)) {
    for (const qid of LATER) {
      for (const opt of all(qid)) {
        const allowed = row.allowed[qid]!;
        const ok = allowed !== "skip" && allowed.includes(opt);
        it(`Q2 „${q2Label}“ + ${opt} → ${ok ? "platí" : "neplatí"}`, () => {
          const value = qid === "q7" ? [opt] : opt;
          const ev = evaluate({ q2: id("q2", q2Label), [qid]: value } as Answers, questionsFile);
          if (ok) {
            expect(ev.cleaned[qid]).toEqual(value);
            expect(ev.invalidated).not.toContain(qid);
          } else {
            expect(ev.cleaned[qid]).toBeUndefined();
            expect(ev.invalidated).toContain(qid);
          }
        });
      }
    }
  }
});

describe("§5.2 změna dřívější volby zruší neplatné pozdější odpovědi a zvýrazní je", () => {
  it("Poplatek → Státní rozpočet s pojistkami: zruší Q3 „Vláda a poslanci“, Q4 „Každá domácnost“, Q5–Q7, Q8 „Podle zisku“", () => {
    const before: Answers = {
      q2: id("q2", "Poplatek jako dnes"),
      q3: id("q3", "Vláda a poslanci každý rok"),
      q4: id("q4", "Každá domácnost"),
      q5: id("q5", "Ano, s horní hranicí"),
      q6: id("q6", "Ano, méně"),
      q7: [id("q7", "Studenti")],
      q8: id("q8", "Podle zisku, s horní hranicí"),
    };
    expect(evaluate(before, questionsFile).invalidated).toEqual([]);
    const ev = evaluate({ ...before, q2: id("q2", "Státní rozpočet s pojistkami") }, questionsFile);
    expect([...ev.invalidated].sort()).toEqual(["q3", "q4", "q5", "q6", "q7", "q8"]);
    for (const qid of ["q3", "q4", "q5", "q6", "q7", "q8"] as QuestionId[]) expect(ev.cleaned[qid]).toBeUndefined();
  });

  it("platné pozdější odpovědi zůstanou (Q3 „Nezávislá komise“ při Q2 = Státní rozpočet s pojistkami)", () => {
    const ev = evaluate(
      { q2: id("q2", "Státní rozpočet s pojistkami"), q3: id("q3", "Nezávislá komise na několik let") },
      questionsFile,
    );
    expect(ev.cleaned.q3).toBe(id("q3", "Nezávislá komise na několik let"));
    expect(ev.invalidated).not.toContain("q3");
  });

  it("návrat k volbě bez omezení otevře všechny otázky znovu", () => {
    const ev = evaluate({ q2: id("q2", "Nevím") }, questionsFile);
    for (const qid of LATER) expect(ev.states[qid].status).toBe("open");
  });

  it("Q1 větvení neovlivňuje", () => {
    for (const q2 of all("q2")) expect(evaluate({ q2, q1: 8 }, questionsFile).states.q1.status).toBe("open");
  });
});

describe("§5.2 pravidla jsou data v questions.yaml", () => {
  it("questions.yaml obsahuje pravidla větvení", () => {
    const raw = readYaml<{ rules?: unknown[] }>("questions.yaml");
    expect(Array.isArray(raw.rules) && raw.rules.length).toBeTruthy();
  });
});

describe("§5 Q7 – výlučné volby", () => {
  it("„Platí všichni“ nejde kombinovat s výjimkami", () => {
    const everyone = id("q7", "Platí všichni");
    const ev = evaluate({ q7: [id("q7", "Studenti"), everyone] }, questionsFile);
    expect(ev.effective.q7).toEqual([everyone]);
  });
  it("„Nevím“ nejde kombinovat s ostatními", () => {
    const nevim = id("q7", "Nevím");
    const ev = evaluate({ q7: [nevim, id("q7", "Studenti")] }, questionsFile);
    expect(ev.effective.q7).toEqual([nevim]);
  });
});
