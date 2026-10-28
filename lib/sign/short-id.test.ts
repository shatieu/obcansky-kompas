import { describe, expect, it } from "vitest";
import { formatShortId, generateShortId, normalizeShortId, parseLookupCode, SHORT_ID_ALPHABET, SHORT_ID_RE } from "./short-id";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xy";

describe("číslo podpisu", () => {
  it("abeceda: Crockford base32 bez I, L, O, U (32 znaků)", () => {
    expect(SHORT_ID_ALPHABET).toHaveLength(32);
    expect(new Set(SHORT_ID_ALPHABET).size).toBe(32);
    for (const c of "ILOU") expect(SHORT_ID_ALPHABET).not.toContain(c);
  });

  it("generuje 8 znaků z abecedy, bez opakování ve 20 000 pokusech", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const id = generateShortId();
      expect(id).toMatch(SHORT_ID_RE);
      seen.add(id);
    }
    expect(seen.size).toBe(20_000);
  });

  it("všechny znaky abecedy se objevují (rovnoměrná náhoda)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 4_000; i++) for (const c of generateShortId()) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(32);
    for (const n of counts.values()) expect(n).toBeGreaterThan(500); // očekávaně 1 000
  });

  it("zobrazení XXXX-XXXX", () => {
    expect(formatShortId("7KQ2M9XA")).toBe("7KQ2-M9XA");
    expect(formatShortId("7kq2-m9xa")).toBe("7KQ2-M9XA");
  });

  it("normalizace: pomlčka, mezery a velikost písmen nevadí; O → 0, I/L → 1", () => {
    expect(normalizeShortId("7kq2-m9xa")).toBe("7KQ2M9XA");
    expect(normalizeShortId(" 7KQ2 M9XA ")).toBe("7KQ2M9XA");
    expect(normalizeShortId("7KQ2–M9XA")).toBe("7KQ2M9XA"); // pomlčka z Wordu
    expect(normalizeShortId("OIL0-0000")).toBe("0110" + "0000");
    expect(normalizeShortId("7KQ2-M9XU")).toBeNull(); // U v abecedě není
    expect(normalizeShortId("7KQ2-M9X")).toBeNull();
    expect(normalizeShortId("7KQ2-M9XAB")).toBeNull();
  });
});

describe("parseLookupCode – číslo nebo odkaz", () => {
  it("číslo s pomlčkou i bez, malými písmeny", () => {
    for (const s of ["7KQ2-M9XA", "7kq2m9xa", " 7kq2-m9xa\n"]) expect(parseLookupCode(s)).toEqual({ kind: "short", shortId: "7KQ2M9XA" });
  });

  it("UUID samotné i v odkazu /v/<uuid> a /v/<uuid>/…", () => {
    const want = { kind: "uuid", uuid: UUID };
    expect(parseLookupCode(UUID.toUpperCase())).toEqual(want);
    expect(parseLookupCode(`https://obcanskykompas.cz/v/${UUID}`)).toEqual(want);
    expect(parseLookupCode(`https://obcanskykompas.cz/v/${UUID}/zakon?s=zakon#x`)).toEqual(want);
    expect(parseLookupCode(`obcanskykompas.cz/v/${UUID}/srovnani`)).toEqual(want);
    expect(parseLookupCode(`/v/${UUID}`)).toEqual(want);
  });

  it("krátký odkaz /v/<číslo>", () => {
    expect(parseLookupCode("https://obcanskykompas.cz/v/7kq2-m9xa")).toEqual({ kind: "short", shortId: "7KQ2M9XA" });
    expect(parseLookupCode("http://localhost:3000/v/7KQ2M9XA/")).toEqual({ kind: "short", shortId: "7KQ2M9XA" });
  });

  it("ověřovací odkaz /overeni/<token> a odkaz pro úpravu", () => {
    expect(parseLookupCode(`https://obcanskykompas.cz/overeni/${TOKEN}`)).toEqual({ kind: "verify", token: TOKEN });
    expect(parseLookupCode(`https://obcanskykompas.cz/overeni/${TOKEN}?utm=x`)).toEqual({ kind: "verify", token: TOKEN });
    expect(parseLookupCode(`https://obcanskykompas.cz/kompas/podpis/uprava/${TOKEN}`)).toEqual({ kind: "edit", token: TOKEN });
  });

  it("nesmysl → null", () => {
    for (const s of ["", "   ", "ahoj", "https://example.com/", "/v/neco-uplne-jineho", "/overeni/kratky", "/kompas", "7KQ2-M9XU", "x".repeat(700)])
      expect(parseLookupCode(s), s).toBeNull();
  });
});
