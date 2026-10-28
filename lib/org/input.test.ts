import { describe, expect, it } from "vitest";
import { questionsFile } from "@/lib/content";
import { cleanText, inviteInputSchema, JUSTIFICATION_MAX, parseSubmit } from "./input";
import { answerLabel, formatDateCz } from "./format";

const token = "A".repeat(43);
const base = { token, confirm: true, answers: { q2: "q2-opt1" } };

describe("org:invite vstup", () => {
  it("přijme platný typ a ořízne mezery", () => {
    expect(inviteInputSchema.parse({ name: " Strana X ", type: "strana", contact: "a@b.cz" })).toEqual({
      name: "Strana X",
      type: "strana",
      contact: "a@b.cz",
    });
  });
  it("odmítne neznámý typ a prázdné jméno", () => {
    expect(inviteInputSchema.safeParse({ name: "X", type: "spolek", contact: "a" }).success).toBe(false);
    expect(inviteInputSchema.safeParse({ name: "  ", type: "hnuti", contact: "a" }).success).toBe(false);
  });
});

describe("odeslání /org/[token]", () => {
  it("platné odeslání vrátí efektivní odpovědi a očištěná odůvodnění", () => {
    const r = parseSubmit({ ...base, justifications: { q2: "  Protože\u0000 to funguje. " } }, questionsFile);
    expect(r).toMatchObject({ ok: true, answers: { q2: "q2-opt1" }, justifications: { q2: "Protože to funguje." } });
  });
  it("vyžaduje potvrzení uzamčení a platný token", () => {
    expect(parseSubmit({ ...base, confirm: false }, questionsFile)).toEqual({ ok: false, reason: "confirm" });
    expect(parseSubmit({ ...base, token: "kratky" }, questionsFile)).toEqual({ ok: false, reason: "token" });
  });
  it("odmítne neznámé volby a prázdné odpovědi", () => {
    expect(parseSubmit({ ...base, answers: { q2: "q2-opt99" } }, questionsFile)).toEqual({ ok: false, reason: "answers" });
    expect(parseSubmit({ ...base, answers: {} }, questionsFile)).toEqual({ ok: false, reason: "answers" });
  });
  it("odůvodnění max. 300 znaků, jen k otázkám q1–q8", () => {
    const ok = parseSubmit({ ...base, justifications: { q2: "ř".repeat(JUSTIFICATION_MAX) } }, questionsFile);
    expect(ok.ok).toBe(true);
    expect(parseSubmit({ ...base, justifications: { q2: "x".repeat(JUSTIFICATION_MAX + 1) } }, questionsFile)).toEqual({
      ok: false,
      reason: "justifications",
    });
    expect(parseSubmit({ ...base, justifications: { q9: "x" } }, questionsFile)).toEqual({ ok: false, reason: "justifications" });
  });
  it("odůvodnění k odpadlé otázce se vynechá, předvyplněné odpovědi se dopočítají", () => {
    const r = parseSubmit({ ...base, answers: { q2: "q2-opt4" }, justifications: { q5: "nic", q2: "ano" } }, questionsFile);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.justifications).toEqual({ q2: "ano" });
    expect(r.answers.q3).toBe("q3-opt1");
    expect(r.answers.q5).toBeUndefined();
  });
  it("cleanText nechá konce řádků, smaže řídicí znaky", () => {
    expect(cleanText("a\r\nb‮c\n\n\n\nd")).toBe("a\nbc\n\nd");
  });
});

describe("formátování pro /hnuti", () => {
  const units = { unit_decimal: "miliardy Kč", unit_whole: "miliard Kč" };
  it("popisky odpovědí", () => {
    const q1 = questionsFile.questions[0]!;
    const q7 = questionsFile.questions.find((q) => q.id === "q7")!;
    expect(answerLabel(q1, 8.5, units)).toBe("8,5 miliardy Kč");
    expect(answerLabel(q1, "q1-nevim", units)).toBe("Nevím");
    expect(answerLabel(q7, ["q7-opt1", "q7-opt2"], units)).toContain(", ");
    expect(answerLabel(q7, undefined, units)).toBeNull();
  });
  it("datum v české zóně", () => {
    expect(formatDateCz("2026-10-27T23:30:00Z")).toBe("28. 10. 2026");
  });
});
