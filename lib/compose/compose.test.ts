import { describe, expect, it } from "vitest";
import { facts, questionsFile } from "@/lib/content";
import { composeStatement, currentContentVersion, evaluate, joinCzech, type Answers, type QuestionId } from "./index";
import { bandThresholds, formatAmount, perAdultMonthly, q1Anchors, q1Band } from "./q1";

const LATER: QuestionId[] = ["q3", "q4", "q5", "q6", "q7", "q8"];
const optionsOf = (qid: QuestionId) => questionsFile.questions.find((q) => q.id === qid)!.options.map((o) => o.id);

/**
 * Očekávání přepsané ručně ze SPEC §5.2 (nezávisle na questions.yaml):
 * pro každou volbu Q2 množina povolených voleb každé pozdější otázky (null = celá otázka odpadá).
 */
type Expect = Record<string, string[] | null>;
const ALL: Expect = Object.fromEntries(LATER.map((q) => [q, optionsOf(q)]));
const STATE_BUDGET: Expect = { q4: ["q4-opt3"], q5: null, q6: null, q7: null, q8: ["q8-opt1"] };
const EXPECTED: Record<string, Expect> = {
  none: ALL,
  "q2-opt1": ALL,
  "q2-opt2": ALL,
  "q2-opt3": { ...STATE_BUDGET, q3: ["q3-opt1", "q3-opt3", "q3-nevim"] },
  "q2-opt4": { ...STATE_BUDGET, q3: ["q3-opt1"] },
  "q2-opt5": { ...STATE_BUDGET, q3: ["q3-opt2"] },
  "q2-opt6": { q3: null, q4: null, q5: null, q6: null, q7: null, q8: null },
  "q2-nevim": ALL,
};

describe("větvení (SPEC §5.2) – všechny kombinace", () => {
  it("pokrývá všechny volby Q2", () => {
    expect(Object.keys(EXPECTED).filter((k) => k !== "none").sort()).toEqual(optionsOf("q2").sort());
  });

  for (const [q2, expectation] of Object.entries(EXPECTED)) {
    const base: Answers = q2 === "none" ? {} : { q2 };
    for (const qid of LATER) {
      const allowed = expectation[qid] ?? null;
      it(`Q2=${q2}: stav ${qid}`, () => {
        const { states, effective } = evaluate(base, questionsFile);
        const st = states[qid];
        if (allowed === null) {
          expect(st.status).toBe("skipped");
          expect(Object.keys(st.disabled).sort()).toEqual(optionsOf(qid).sort());
          expect(effective[qid]).toBeUndefined();
          return;
        }
        expect(st.status).toBe("open");
        const enabled = optionsOf(qid).filter((o) => !st.disabled[o]);
        expect(enabled.sort()).toEqual([...allowed].sort());
        if (allowed.length === 1) {
          expect(st.forced).toBe(allowed[0]);
          expect(effective[qid]).toEqual(qid === "q7" ? [allowed[0]] : allowed[0]);
        } else expect(st.forced).toBeUndefined();
        // Zašedlé volby nesou důvod = volba v Q2.
        for (const cause of Object.values(st.disabled)) expect(cause).toMatchObject({ question: "q2", option: q2 });
      });

      for (const opt of optionsOf(qid)) {
        it(`Q2=${q2}: odpověď ${opt}`, () => {
          const value = qid === "q7" ? [opt] : opt;
          const ev = evaluate({ ...base, [qid]: value }, questionsFile);
          const ok = allowed !== null && allowed.includes(opt);
          if (ok) {
            expect(ev.cleaned[qid]).toEqual(value);
            expect(ev.effective[qid]).toEqual(value);
            expect(ev.invalidated).not.toContain(qid);
          } else {
            expect(ev.cleaned[qid]).toBeUndefined();
            expect(ev.invalidated).toContain(qid);
            if (allowed?.length === 1) expect(ev.effective[qid]).toEqual(qid === "q7" ? [allowed[0]] : allowed[0]);
            else expect(ev.effective[qid]).toBeUndefined();
          }
        });
      }
    }
  }

  it("Q1 větvení neovlivňuje", () => {
    for (const q2 of optionsOf("q2")) {
      const ev = evaluate({ q2, q1: 7.3 }, questionsFile);
      expect(ev.states.q1.status).toBe("open");
      expect(ev.effective.q1).toBe(7.3);
    }
  });

  it("změna dřívější volby zruší neplatné pozdější odpovědi", () => {
    const answers: Answers = { q2: "q2-opt1", q3: "q3-opt2", q4: "q4-opt1", q5: "q5-opt2", q6: "q6-opt1", q7: ["q7-opt2"], q8: "q8-opt3" };
    expect(evaluate(answers, questionsFile).invalidated).toEqual([]);
    const after = evaluate({ ...answers, q2: "q2-opt3" }, questionsFile);
    expect(after.invalidated.sort()).toEqual(["q3", "q4", "q5", "q6", "q7", "q8"]);
    expect(after.cleaned).toEqual({ q2: "q2-opt3" });
    expect(after.effective).toEqual({ q2: "q2-opt3", q4: "q4-opt3", q8: "q8-opt1" });
    // Návrat na volbu bez omezení: předvyplněné odpovědi zmizí, nic se nevymýšlí.
    const back = evaluate({ ...after.cleaned, q2: "q2-opt2" }, questionsFile);
    expect(back.effective).toEqual({ q2: "q2-opt2" });
  });
});

describe("Q7 – více voleb", () => {
  it("řadí podle pořadí voleb a odstraní duplicity", () => {
    expect(evaluate({ q7: ["q7-opt3", "q7-opt1", "q7-opt3"] }, questionsFile).effective.q7).toEqual(["q7-opt1", "q7-opt3"]);
  });
  it("exkluzivní volby (Platí všichni, Nevím) vyloučí ostatní", () => {
    expect(evaluate({ q7: ["q7-opt1", "q7-opt5"] }, questionsFile).effective.q7).toEqual(["q7-opt5"]);
    expect(evaluate({ q7: ["q7-nevim", "q7-opt2"] }, questionsFile).effective.q7).toEqual(["q7-nevim"]);
  });
  it("neznámé volby zahodí a označí", () => {
    const ev = evaluate({ q7: ["q7-opt1", "xx"] }, questionsFile);
    expect(ev.effective.q7).toEqual(["q7-opt1"]);
    expect(ev.invalidated).toContain("q7");
  });
});

describe("Q1", () => {
  const t = bandThresholds(questionsFile, facts)!;
  it("kotvy jsou z facts.yaml", () => {
    const anchors = q1Anchors(questionsFile, facts);
    const gov = facts.find((f) => f.id === "gov-proposal-total-bn")!.value!;
    const today = facts.find((f) => f.id === "today-total-bn")!.value!;
    expect(anchors.find((a) => a.id === "gov")!.value).toBeCloseTo(gov, 1);
    expect(anchors.find((a) => a.id === "today")!.value).toBeCloseTo(today, 1);
    expect(anchors.find((a) => a.id === "today-plus-10")!.value).toBeCloseTo(Math.round(today * 11) / 10, 1);
  });
  it("pásma", () => {
    expect(q1Band(t.gov - 0.1, t)).toBe("below-gov");
    expect(q1Band(t.gov, t)).toBe("gov");
    expect(q1Band(t.gov + 0.1, t)).toBe("between");
    expect(q1Band(t.today, t)).toBe("today");
    expect(q1Band(t.today + 0.1, t)).toBe("above-today");
  });
  it("posuvník se ořízne na rozsah a krok", () => {
    expect(evaluate({ q1: 99 }, questionsFile).effective.q1).toBe(12);
    expect(evaluate({ q1: 7.849 }, questionsFile).effective.q1).toBe(7.8);
  });
  it("částka česky", () => {
    const u = { unit_decimal: "miliardy Kč", unit_whole: "miliard Kč" };
    expect(formatAmount(8.5, u)).toBe("8,5 miliardy Kč");
    expect(formatAmount(9, u)).toBe("9 miliard Kč");
  });
  it("přepočet na dospělého", () => {
    const f = [{ id: "adults-count", value: 1_000_000, unit: "", claim: "", source_url: "", source_title: "", locator: "", status: "draft" }];
    expect(perAdultMonthly(1.2, f)).toBe(100);
    expect(perAdultMonthly(1.2, [])).toBeNull();
  });
});

describe("composeStatement (SPEC §6)", () => {
  const v = currentContentVersion();

  it("prázdné odpovědi = úvod + závěr", () => {
    const s = composeStatement({}, v);
    expect(s.parts).toHaveLength(2);
    expect(s.contentVersion).toBe(v);
  });

  it("je deterministický a skládá věty v pořadí otázek", () => {
    const a: Answers = { q8: "q8-opt2", q1: 8.5, q2: "q2-opt1", q7: ["q7-opt2", "q7-opt1"], q3: "q3-nevim" };
    const s1 = composeStatement(a, v);
    const s2 = composeStatement({ ...a }, v);
    expect(s1).toEqual(s2);
    // Pořadí zobrazení (questions.yaml `order`): otázka na peníze (q1) je až na konci.
    expect(s1.parts.map((p) => p.questionId)).toEqual([null, "q2", "q3", "q7", "q8", "q1", null]);
    expect(s1.text).toContain("8,5 miliardy Kč");
    expect(s1.text).toContain("lidé s nízkým příjmem a studenti");
    expect(s1.parts[2]!.text).toContain("nechávám rozhodnutí na odbornících");
  });

  it("věty Nevím lze skrýt", () => {
    const s = composeStatement({ q2: "q2-nevim", q3: "q3-opt1" }, v, { hideUnknown: true });
    expect(s.parts.map((p) => p.questionId)).toEqual([null, "q3", null]);
  });

  it("předvyplněné odpovědi se propíšou, odpadlé otázky ne", () => {
    const s = composeStatement({ q2: "q2-opt4", q5: "q5-opt1" }, v);
    expect(s.parts.map((p) => p.sentenceId)).toEqual(["intro", "q2-opt4", "q3-opt1", "q4-opt3", "q8-opt1", "outro"]);
  });

  it("neznámá verze obsahu = chyba", () => {
    expect(() => composeStatement({}, "0000")).toThrow();
  });

  it("žádná kombinace nezanechá nevyplněný zástupný symbol", () => {
    const pick = (qid: QuestionId) => optionsOf(qid);
    let n = 0;
    for (const q1 of [5, 7.8, 8.5, 9.2, 12, "q1-nevim"] as const)
      for (const q2 of pick("q2"))
        for (const q3 of pick("q3"))
          for (const q4 of pick("q4"))
            for (const q5 of pick("q5"))
              for (const q6 of pick("q6"))
                for (const q8 of pick("q8")) {
                  const q7 = pick("q7")[n % pick("q7").length]!;
                  const s = composeStatement({ q1, q2, q3, q4, q5, q6, q7: [q7], q8 }, v);
                  if (/[{}]/.test(s.text)) throw new Error(s.text);
                  n++;
                }
    expect(n).toBeGreaterThan(10_000);
  });

  it("joinCzech", () => {
    expect(joinCzech(["a"])).toBe("a");
    expect(joinCzech(["a", "b", "c"])).toBe("a, b a c");
  });
});
