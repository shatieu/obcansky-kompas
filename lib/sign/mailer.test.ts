import { describe, expect, it } from "vitest";
import { composeStatement, currentContentVersion } from "@/lib/compose";
import { buildMessage } from "./mailer";

describe("ověřovací e-mail", () => {
  it("obsahuje text k podpisu po odstavcích se štítky", () => {
    const statement = composeStatement({ q2: "q2-opt1", q3: "q3-nevim" }, currentContentVersion()).text;
    const m = buildMessage("verify", "a@example.invalid", "https://x.test/o/abc", statement);
    expect(m.text).toContain("https://x.test/o/abc");
    expect(m.text).toContain("\n\nOdkud peníze: ");
    expect(m.text).toContain("\n\nKdo určí výši: ");
    expect(m.text).not.toContain("{statement}");
  });

  it("bez textu (neznámá verze) se sekce vynechá", () => {
    const m = buildMessage("verify", "a@example.invalid", "https://x.test/o/abc");
    expect(m.text).not.toContain("{statement}");
    expect(m.text).not.toMatch(/\n{3,}/);
  });
});
