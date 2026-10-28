import { describe, expect, it } from "vitest";
import { questionsFile } from "@/lib/content";
import { failedField, signInputSchema, TOKEN_RE, UUID_RE, validateAnswers } from "./input";

const schema = signInputSchema(questionsFile);
const base = { name: "Jana", email: "jana@seznam.cz", consent: true, answers: { q2: "q2-opt1" } };

describe("signInputSchema", () => {
  it("minimum: jméno, e-mail, souhlas; nepovinná pole mohou chybět", () => {
    const r = schema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.showName).toBe(false);
  });

  it("odmítne chybějící souhlas, prázdné jméno, špatný e-mail a dlouhý komentář", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, consent: false }, "consent"],
      [{ ...base, name: "   " }, "name"],
      [{ ...base, email: "neni-email" }, "email"],
      [{ ...base, comment: "a".repeat(questionsFile.demographics.comment_max + 1) }, "comment"],
    ];
    for (const [input, field] of cases) {
      const r = schema.safeParse(input);
      expect(r.success, field).toBe(false);
      expect(failedField(r.error!)).toBe(field);
    }
  });

  it("demografie jen ze známých hodnot", () => {
    expect(schema.safeParse({ ...base, region: "CZ010", ageGroup: "18-29" }).success).toBe(true);
    expect(schema.safeParse({ ...base, region: "XX" }).success).toBe(false);
    expect(schema.safeParse({ ...base, region: "" }).success).toBe(true);
  });
});

describe("validateAnswers", () => {
  it("vrátí efektivní odpovědi a zaokrouhlí Q1 na 0,1", () => {
    const r = validateAnswers({ q1: 8.53, q2: "q2-opt1", q7: ["q7-opt2", "q7-opt2"] }, questionsFile);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.q1).toBe(8.5);
      expect(r.answers.q7).toEqual(["q7-opt2"]);
    }
  });

  it("odmítne neznámé otázky, volby, typy a částky mimo rozsah", () => {
    for (const bad of [
      { q9: "x" },
      { q2: "q3-opt1" },
      { q2: ["q2-opt1"] },
      { q7: "q7-opt2" },
      { q7: [] },
      { q1: 1 },
      { q1: 99 },
      { q1: "q2-nevim" },
      {},
    ])
      expect(validateAnswers(bad as Record<string, unknown>, questionsFile).ok, JSON.stringify(bad)).toBe(false);
  });

  it("Nevím u posuvníku je platná odpověď", () => {
    expect(validateAnswers({ q1: "q1-nevim" }, questionsFile).ok).toBe(true);
  });
});

describe("formáty", () => {
  it("UUID a token", () => {
    expect(UUID_RE.test("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(UUID_RE.test("x")).toBe(false);
    expect(TOKEN_RE.test("a".repeat(43))).toBe(true);
    expect(TOKEN_RE.test("short")).toBe(false);
    expect(TOKEN_RE.test("a".repeat(42) + "/")).toBe(false);
  });
});
