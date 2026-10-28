import { describe, expect, it } from "vitest";
import {
  formatDateCz,
  mailtoHref,
  personName,
  slugify,
  splitAddress,
  splitParagraphs,
  uniqueNames,
  wrapText,
} from "./text";
import {
  krajRecipient,
  obecRecipient,
  poslanecRecipient,
  resolveObvod,
  senateChoice,
  senatorRecipient,
  staticRecipient,
  type DirObec,
  type PostalTexts,
} from "./recipients";
import { lawFileBase } from "./law-meta";

const mono = (s: string) => s.length; // 1 znak = 1 jednotka

describe("wrapText", () => {
  it("zalamuje po slovech a nepřekročí šířku", () => {
    const lines = wrapText("Příliš žluťoučký kůň úpěl ďábelské ódy", 12, mono);
    expect(lines).toEqual(["Příliš", "žluťoučký", "kůň úpěl", "ďábelské ódy"]);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(12);
  });
  it("\\n je vynucený konec řádku, prázdný řádek zůstane", () => {
    expect(wrapText("a b\n\nc", 10, mono)).toEqual(["a b", "", "c"]);
  });
  it("příliš dlouhé slovo rozdělí po znacích", () => {
    expect(wrapText("abcdefghij", 4, mono)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("nezlomitelná mezera drží slova u sebe", () => {
    expect(wrapText("9,2 mld Kč", 8, mono)).toEqual(["9,2 mld", "Kč"]);
  });
});

describe("pomocné funkce", () => {
  it("splitParagraphs", () => {
    expect(splitParagraphs("A\nB\n\n\nC  \n \nD")).toEqual(["A\nB", "C", "D"]);
  });
  it("slugify odstraní diakritiku", () => {
    expect(slugify("Mgr. Věra Adámková, CSc.")).toBe("mgr-vera-adamkova-csc");
    expect(slugify("***")).toBe("soubor");
  });
  it("uniqueNames", () => {
    expect(uniqueNames(["a.pdf", "b.pdf", "a.pdf", "a.pdf"])).toEqual(["a.pdf", "b.pdf", "a-2.pdf", "a-3.pdf"]);
  });
  it("splitAddress", () => {
    expect(splitAddress("Mariánské náměstí 2/2, Staré Město, 110 00 Praha 1")).toEqual(["Mariánské náměstí 2/2", "Staré Město", "110 00 Praha 1"]);
    expect(splitAddress(null)).toEqual([]);
  });
  it("formatDateCz", () => {
    expect(formatDateCz(new Date(2026, 9, 8))).toBe("8. 10. 2026");
  });
  it("personName", () => {
    expect(personName({ titul_pred: "prof. MUDr.", jmeno: "Věra", prijmeni: "Adámková", titul_za: "CSc." })).toBe("prof. MUDr. Věra Adámková, CSc.");
    expect(personName({ titul_pred: null, jmeno: "Marek", prijmeni: "Benda", titul_za: null })).toBe("Marek Benda");
  });
  it("mailtoHref kóduje mezery jako %20 a konce řádků jako CRLF", () => {
    const href = mailtoHref("a@b.cz", "Věc a", "Dobrý den,\n\nX");
    expect(href.startsWith("mailto:a@b.cz?subject=V%C4%9Bc%20a&body=")).toBe(true);
    expect(href).toContain("%0D%0A%0D%0AX");
    expect(href).not.toContain("+");
  });
  it("lawFileBase", () => {
    expect(lawFileBase("muj-zakon", "1234abcd-0000-4000-8000-000000000000")).toBe("muj-zakon-1234abcd");
    expect(lawFileBase("muj-zakon", "")).toBe("muj-zakon");
  });
});

const postal: PostalTexts = {
  poslanec_org: "Poslanecká sněmovna",
  poslanec_address: "Sněmovní 176/4, 118 26 Praha 1",
  senator_org: "Senát",
  senator_address: "Valdštejnské náměstí 17/4, 118 01 Praha 1",
  kraj_recipient: "Zastupitelstvo kraje",
  obec_recipient: "Zastupitelstvo obce",
  senator_detail: "Obvod č. {n} – {name}",
};

describe("adresáti", () => {
  it("poslanec: jméno s tituly, adresa sněmovny, e-mail, bez datové schránky", () => {
    const r = poslanecRecipient(
      { id: 6254, jmeno: "Věra", prijmeni: "Adámková", titul_pred: "prof. MUDr.", titul_za: "CSc.", kraj_code: "CZ010", klub_zkratka: "ANO2011", email: "adamkovav@psp.cz" },
      postal,
    );
    expect(r.key).toBe("poslanec:6254");
    expect(r.postal).toEqual(["prof. MUDr. Věra Adámková, CSc.", "Poslanecká sněmovna", "Sněmovní 176/4", "118 26 Praha 1"]);
    expect(r.email).toBe("adamkovav@psp.cz");
    expect(r.dataBox).toBeNull();
    expect(r.fileBase).toBe("dopis-adamkova-vera");
  });
  it("senátor: detail s obvodem", () => {
    const r = senatorRecipient({ obvod_cislo: 22, obvod_nazev: "Praha 10", id: 361, jmeno: "Jan Pirk", jmeno_s_tituly: "prof. MUDr. Jan Pirk, Dr.Sc.", email: null }, postal);
    expect(r.detail).toBe("Obvod č. 22 – Praha 10");
    expect(r.email).toBeNull();
  });
  it("úřady mají datovou schránku", () => {
    const k = krajRecipient(
      { code: "CZ064", name: "Jihomoravský kraj", krajsky_urad: { name: "Jihomoravský kraj", address: "Žerotínovo náměstí 449/3, Veveří, 602 00 Brno", datova_schranka: "x2pbqzq" } },
      postal,
    );
    expect(k.dataBox).toBe("x2pbqzq");
    expect(k.postal[0]).toBe("Zastupitelstvo kraje");
    const o = obecRecipient({ kod: 1, nazev: "Blatec", urad: { address: "Blatec 1, 783 75 Blatec", datova_schranka: "abc1234", nazev: "Obec Blatec" } }, postal);
    expect(o.postal).toEqual(["Zastupitelstvo obce", "Obec Blatec", "Blatec 1", "783 75 Blatec"]);
    const m = staticRecipient("ministr-kultury", {
      adresat: "Ministr kultury",
      urad: "Ministerstvo kultury",
      address: "Maltézské náměstí 471/1, Malá Strana, 118 00 Praha 1",
      address_podatelna: "Maltézské náměstí 1, 118 00 Praha 1",
      datova_schranka: "8spaaur",
      email: "epodatelna@mk.gov.cz",
    });
    expect(m.postal).toEqual(["Ministr kultury", "Ministerstvo kultury", "Maltézské náměstí 1", "118 00 Praha 1"]);
    expect(m.dataBox).toBe("8spaaur");
  });

  it("adresát-osoba: pohlaví z adresáře, funkce podle pohlaví pod jménem v adrese, strana z klubu", () => {
    const roles = { m: "poslanec", z: "poslankyně" };
    const z = poslanecRecipient(
      { id: 1, jmeno: "Jana", prijmeni: "Černochová", titul_pred: "Mgr.", titul_za: null, kraj_code: "CZ010", pohlavi: "Z", klub: "Poslanecký klub ODS", klub_zkratka: "ODS", email: null },
      postal,
      roles,
    );
    expect(z.gender).toBe("Z");
    expect(z.detail).toBe("ODS");
    expect(z.postal.slice(0, 3)).toEqual(["Mgr. Jana Černochová", "poslankyně", "Poslanecká sněmovna"]);
    const m = poslanecRecipient(
      { id: 2, jmeno: "Marek", prijmeni: "Benda", titul_pred: null, titul_za: null, kraj_code: "CZ010", pohlavi: "M", klub: "Poslanecký klub ANO 2011", klub_zkratka: "ANO2011", email: null },
      postal,
      roles,
    );
    expect(m.detail).toBe("ANO 2011");
    expect(m.postal[1]).toBe("poslanec");
    // Bez pohlaví žádná funkce (nehádá se).
    const u = senatorRecipient({ obvod_cislo: 1, obvod_nazev: "X", id: 3, jmeno: "A B", jmeno_s_tituly: "A B", email: null }, postal, { m: "senátor", z: "senátorka" });
    expect(u.gender).toBeNull();
    expect(u.postal[1]).toBe("Senát");
    // Úřad se jménem držitele: jméno, funkce, úřad, adresa.
    const k = staticRecipient(
      "ministr-kultury",
      {
        adresat: "Ministr kultury",
        osoba: { jmeno: "Oto", prijmeni: "Klempíř", titul_pred: null, titul_za: null, pohlavi: "M" },
        urad: "Ministerstvo kultury",
        address: null,
        address_podatelna: "Maltézské náměstí 1, 118 00 Praha 1",
        datova_schranka: "8spaaur",
        email: null,
      },
      { m: "ministr kultury", z: "ministryně kultury" },
    );
    expect(k.name).toBe("Oto Klempíř");
    expect(k.gender).toBe("M");
    expect(k.postal).toEqual(["Oto Klempíř", "ministr kultury", "Ministerstvo kultury", "Maltézské náměstí 1", "118 00 Praha 1"]);
  });
});

describe("senátní obvod z obce", () => {
  const office = { address: null, datova_schranka: null, nazev: null };
  const single: DirObec = { kod: 1, nazev: "Opava", kraj_code: "CZ080", okres: "Opava", senatni_obvod: [68], urad: office };
  const split: DirObec = {
    kod: 2,
    nazev: "Praha",
    kraj_code: "CZ010",
    okres: "Praha",
    senatni_obvod: [22, 26, 27],
    urad: office,
    casti: [
      { kod: 10, nazev: "Praha 1", senatni_obvod: [27], urad: office },
      { kod: 11, nazev: "Praha 10", senatni_obvod: [22, 26], urad: office },
    ],
  };
  it("jeden obvod → hotovo", () => {
    expect(resolveObvod(single, null, null)).toBe(68);
    expect(senateChoice(single, null).casti).toEqual([]);
  });
  it("rozdělené město → nejdřív část", () => {
    expect(senateChoice(split, null).casti).toHaveLength(2);
    expect(resolveObvod(split, null, null)).toBeNull();
    expect(resolveObvod(split, 10, null)).toBe(27);
  });
  it("část se dvěma obvody → volba obvodu", () => {
    expect(senateChoice(split, 11).obvody).toEqual([22, 26]);
    expect(resolveObvod(split, 11, null)).toBeNull();
    expect(resolveObvod(split, 11, 26)).toBe(26);
    expect(resolveObvod(split, 11, 99)).toBeNull();
  });
  it("víc obvodů bez částí → volba obvodu", () => {
    const o: DirObec = { ...single, senatni_obvod: [1, 2] };
    expect(senateChoice(o, null)).toEqual({ obvody: [1, 2], casti: [] });
    expect(resolveObvod(o, null, 2)).toBe(2);
  });
});
