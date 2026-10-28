import { describe, expect, it } from "vitest";
import { MAX_VARIANTS, normalizeForms } from "./normalize";
import { hasForeignLetters, hasLetterSymbols, scriptCheck, SLOGAN_MAX } from "./script";

/*
 * Obcházení normalizace (bezpečnostní review): podobné znaky mimo NFKC, kombinace dvojznačných
 * čtení, písmena mimo podporovaná písma, regionální indikátory a písmena jako symboly.
 * Sady vulgarit jsou záměrně jen v testech.
 */
const slogan = (t: string, ai = false) => scriptCheck(t, "slogan", { ai });
const name = (t: string) => scriptCheck(t, "name");
const joined = (t: string) => normalizeForms(t).map((f) => f.joined);

describe("confusables skeleton", () => {
  it("kapitálky ᴀ–ᴢ", () => {
    expect(joined("ᴋᴜʀᴠᴀ")).toContain("kurva");
    expect(joined("ᴋᴏᴋᴏᴛ")).toContain("kokot");
  });
  it("IPA a rozšířená latinka (ɡ ʀ ɴ ʟ ɪ ɛ)", () => {
    expect(joined("kuʀva")).toContain("kurva");
    expect(joined("ɪdɪot")).toContain("idiot");
    expect(joined("dɛbɪʟ")).toContain("debil");
    expect(joined("ɡay ʀɴʟ")[0]).toBe("gairnl");
  });
  it("plnošířková a matematická písmena (NFKC)", () => {
    expect(joined("ｋｕｒｖａ")).toContain("kurva");
    expect(joined("𝓀𝓊𝓇𝓋𝒶")).toContain("kurva");
    expect(joined("𝐤𝐮𝐫𝐯𝐚")).toContain("kurva");
  });
  it("kroužková a čtverečková písmena 🄰 🅐 🅰 Ⓐ ⓐ", () => {
    for (const t of ["🄺🅄🅁🅅🄰", "🅚🅤🅡🅥🅐", "🅺🆄🆁🆅🅰", "ⓀⓊⓇⓋⒶ", "ⓚⓤⓡⓥⓐ"]) expect(joined(t)).toContain("kurva");
  });
  it("regionální indikátory 🇦–🇿 → písmena", () => {
    expect(joined("🇰🇺🇷🇻🇦")).toContain("kurva");
    expect(joined("ku🇷🇻a")).toContain("kurva");
  });
});

describe("kombinace dvojznačných čtení", () => {
  it("smíšené čtení v jednom slově (с = s foneticky, 1 = i vizuálně)", () => {
    // dřív se zkoušely jen dvě jednotné varianty celého textu: „cvine“ a „svlne“
    expect(joined("сv1ne")).toContain("svine");
  });
  it("víc než 6 dvojznačných znaků: každé slovo zvlášť ve všech kombinacích", () => {
    const forms = normalizeForms("1111 1111 сv1ně");
    expect(forms.some((f) => f.words.includes("svine"))).toBe(true);
    expect(forms.length).toBeLessThanOrEqual(2 + 3 * MAX_VARIANTS);
  });
  it("počet variant je omezený i pro dlouhé dvojznačné slovo", () => {
    expect(normalizeForms("1!|1!|1!|1!|1!|1!|1!|1!|1!|1!|1!|1!|1!").length).toBeLessThanOrEqual(2 + MAX_VARIANTS);
  });
});

describe("skriptová kontrola odmítne obcházení", () => {
  const EVASIONS = [
    "ᴋᴜʀᴠᴀ vláda",
    "Ty kuʀvo",
    "ɪdɪoti ve vládě",
    "𝐤𝐮𝐫𝐯𝐚",
    "🅺🆄🆁🆅🅰",
    "🅚🅤🅡🅥🅐 vláda",
    "🇰🇺🇷🇻🇦",
    "ku🇷🇻a",
    "сv1ně ve vládě",
    "1111 1111 сv1ně",
    "ℂ𝕋 patří nám",
    "Hanba ᴠládě",
    "ｈａｎｂａ",
  ];
  for (const t of EVASIONS) it(`„${t}“ neprojde`, () => expect(slogan(t)).toEqual({ ok: false }));

  it("jména: kapitálky a IPA neprojdou (jsou Script=Latin, ale písmena jako symboly)", () => {
    expect(name("ᴋᴜʀᴠᴀ")).toEqual({ ok: false });
    expect(name("Jᴀna")).toEqual({ ok: false });
    expect(name("Jana")).toEqual({ ok: true, text: "Jana" });
  });
});

describe("písma a symboly", () => {
  it("písmena mimo latinku/cyrilici/řečtinu: bez AI odmítnuto, s AI do stupně 2", () => {
    for (const t of ["自由媒体", "ᏦᏌᎡᏙᎪ vláda", "Svobodná média ✡ שלום"]) {
      expect(hasForeignLetters(t)).toBe(true);
      expect(slogan(t)).toEqual({ ok: false });
      const r = slogan(t, true);
      expect(r.ok && r.review).toBe(true);
    }
  });
  it("latinka, cyrilice a řečtina projdou bez příznaku review", () => {
    for (const t of ["Svobodná média", "Слава Україні", "Ελευθερία"]) {
      expect(hasForeignLetters(t)).toBe(false);
      const r = slogan(t, true);
      expect(r).toEqual({ ok: true, text: t });
    }
  });
  it("jedna samostatná vlajka projde, víc indikátorů nebo přilepená vlajka ne", () => {
    expect(slogan("Svobodná média 🇨🇿")).toEqual({ ok: true, text: "Svobodná média 🇨🇿" });
    expect(hasLetterSymbols("🇨🇿 Česko")).toBe(false);
    expect(hasLetterSymbols("Česko🇨🇿")).toBe(true);
    expect(hasLetterSymbols("🇨🇿🇺🇦 spolu")).toBe(true);
    expect(hasLetterSymbols("🇨 sama")).toBe(true);
  });
  it("běžné symboly (№ jako znak, ™, °C) nejsou písmena jako symboly", () => {
    expect(hasLetterSymbols("Zákon № 1")).toBe(false);
    expect(hasLetterSymbols("Média™ 30 °C")).toBe(false);
    expect(hasLetterSymbols("ℂ")).toBe(true);
  });
});

describe("fixShouting nepřekročí 40 znaků", () => {
  it("převod, který text prodlouží (İ → i̇), se odmítne", () => {
    const t = "İ".repeat(20) + " " + "A".repeat(19);
    expect(Array.from(t).length).toBe(SLOGAN_MAX);
    expect(slogan(t)).toEqual({ ok: false });
  });
  it("běžný převod velkých písmen projde a zůstane do 40 znaků", () => {
    const r = slogan("HANBA VLÁDĚ, MÉDIA PATŘÍ NÁM VŠEM!!");
    expect(r).toEqual({ ok: true, text: "Hanba vládě, média patří nám všem!!" });
  });
});
