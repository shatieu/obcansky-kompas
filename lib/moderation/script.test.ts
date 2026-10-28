import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { LISTS_OUT, PROMPT_OUT, renderLists, renderPrompt } from "./build-lists";
import { normalizeForms } from "./normalize";
import { countEmoji, fixShouting, hasContactOrLink, scriptCheck } from "./script";

/*
 * Testy skriptové moderace (SPEC-demonstrace §11). Sady vulgarit jsou záměrně jen tady
 * v testech, ne v UI ani na /metodika.
 */

const slogan = (t: string) => scriptCheck(t, "slogan");
const name = (t: string) => scriptCheck(t, "name");

describe("vygenerované seznamy", () => {
  it("lists.generated.ts a prompt.generated.ts odpovídají content/moderation/*", () => {
    expect(readFileSync(LISTS_OUT, "utf8")).toBe(renderLists());
    expect(readFileSync(PROMPT_OUT, "utf8")).toBe(renderPrompt());
  });
});

describe("normalizace", () => {
  const joined = (t: string) => normalizeForms(t).map((f) => f.joined);
  it("malá písmena, bez diakritiky, y→i, zkrácení opakování", () => {
    expect(joined("ŽLUŤOUČKÝ kůůůň")).toEqual(["zlutoucki kun".replace(" ", "")]);
  });
  it("leetspeak a symboly", () => {
    expect(joined("k3r3t3n $v@ť")[0]).toBe("keretensvat");
    // všechny kombinace čtení dvojznačných znaků (1 = i/l)
    expect(new Set(joined("1d10t"))).toEqual(new Set(["idiot", "ldiot", "idlot", "ldlot"]));
  });
  it("cyrilice vizuálně i foneticky, řečtina", () => {
    expect(joined("курва")).toContain("kurva");
    expect(joined("ΚΟΚΟΤ")).toEqual(["kokot"]);
  });
  it("oddělovače a neviditelné znaky", () => {
    expect(joined("k.u-r_v a")).toEqual(["kurva"]);
    expect(normalizeForms("ku​rva")[0]!.words).toEqual(["kurva"]);
  });
  it("plnošířková a matematická písmena", () => {
    expect(joined("ｋｏｋｏｔ")).toEqual(["kokot"]);
    expect(joined("𝐤𝐨𝐤𝐨𝐭")).toEqual(["kokot"]);
  });
});

// Obcházecí pokusy – každý musí skončit { ok: false }.
const EVASIONS = [
  // přímé tvary a koncovky
  "kurva",
  "Ty kurvo jedna",
  "Zkurvená vláda",
  "Zkurvysyni ve vládě",
  "kurevská práce",
  "Do píče s tím",
  "píčovina",
  "Píčus",
  "Kokot",
  "kokotina zákon",
  "čurák",
  "Debilové u moci",
  "Kreténi",
  "idioti!",
  "imbecilní zákon",
  "hovno",
  "hovnivál vláda",
  "prdel",
  "Do prdele s poplatky",
  "sračka",
  "zasraný zákon",
  "posraná vláda",
  "seru na vás",
  "serou na nás",
  "hajzlové",
  "zmrdi",
  "vyjebaní politici",
  "pojebaný",
  "mrdat vládu",
  "šukat",
  "kunda",
  "Děvka",
  "svině",
  "sviňárna",
  "hovado",
  "parchanti",
  "magoři",
  "retardi",
  "mongoloidi",
  "kripl",
  "pitomci ve vládě",
  "blbci",
  "hňupe",
  "Ty vole",
  "vůl",
  "buzna",
  "buzerant",
  "teplouš",
  "negři",
  "cikáni ven",
  "cigoši",
  "židák",
  "Sieg Heil",
  "heil",
  "Hitler měl pravdu",
  "zastřelit je",
  "na šibenici",
  "zabij",
  // slovenské
  "kokotko",
  "chuj",
  "jebať vládu",
  "skurvysyn",
  "piči",
  "dopiče",
  "zpíčený",
  "šoustat",
  // anglické
  "fuck",
  "FUCK THE GOVERNMENT",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "whore",
  "nigger",
  "wanker",
  // mezery a oddělovače
  "k u r v a",
  "k.u.r.v.a",
  "k-u-r-v-a",
  "k_u_r_v_a",
  "k/u/r/v/a",
  "k*u*r*v*a",
  "kur va",
  "kur.va",
  "ku rva",
  "k r e t e n",
  "k.r.e.t.e.n",
  "d e b i l",
  "m r d",
  "p í č a",
  "f u c k",
  "sh.it",
  "vláda k u r v a",
  "ty k u r v o",
  // leetspeak
  "kurv4",
  "kurv@",
  "k0k0t",
  "kr3t3n",
  "d3b1l",
  "1d10t",
  "$r@ck@",
  "p1č@",
  "h0vn0",
  "fvck",
  "sh1t",
  "b1tch",
  "zmrd",
  "zm®d",
  // diakritika a velikost
  "KURVA",
  "KuRvA",
  "kůrva",
  "kúrva",
  "kurvá",
  "pica",
  "pyča",
  "kretén",
  "kreten",
  // opakování
  "kuuurva",
  "kurrrrvaaaa",
  "kkkkokot",
  "deeebil",
  "fuuuck",
  "shiiit",
  // cyrilice a řečtina
  "курва",
  "kурва",
  "kуrvа",
  "кокот",
  "дебил",
  "kοkοt",
  "ΚΟΚΟΤ",
  "κurva",
  "ԁebil",
  // smíšené
  "K.u.R.v.4",
  "k u r v 4",
  "K-0-K-0-T",
  "Ⓚⓤⓡⓥⓐ",
  "ｋｕｒｖａ",
  "𝐤𝐮𝐫𝐯𝐚",
  "ku​rva",
  "ku­rva",
  "ḱurva",
  "kurwa",
  "kurfa",
  "Vláda = kurvy",
  "Ruce pryč od ČT, kurva",
];

describe("blocklist – obcházecí pokusy", () => {
  it(`odmítne všech ${EVASIONS.length} pokusů`, () => {
    const passed = EVASIONS.filter((t) => slogan(t.length < 3 ? `${t}!!` : t).ok);
    expect(passed).toEqual([]);
  });
  it("i ve jméně", () => {
    for (const t of ["Kurva", "Kokot", "Debil", "Píča", "Zmrd", "Fuck"]) expect(name(t)).toEqual({ ok: false });
  });
});

// Neutrální slogany – všechny musí projít (allowlist nesmí blokovat běžná slova).
const NEUTRAL = [
  "Ruce pryč od veřejnoprávních médií",
  "Veřejnoprávní média mi nejsou jedno",
  "Nezávislá média jsou základ demokracie",
  "Česká televize patří nám všem",
  "Rozhlas není hračka vlády",
  "Chci zprávy, ne propagandu",
  "Poplatky ano, cenzura ne",
  "Média nejsou svatá, ale jsou naše",
  "Zrušte poplatky",
  "Stačilo televize za naše peníze",
  "Ať si ČT platí diváci",
  "Svobodné slovo, svobodná země",
  "Demokracie potřebuje novináře",
  "Pravda vítězí",
  "Žádné politické čistky v ČT",
  "Financování médií mimo státní rozpočet",
  "Rada ČT pro veřejnost",
  "Vláda lže o médiích",
  "Hanba vládě",
  "Tenhle zákon je ostuda",
  "Demise!",
  "Babiš, nesahej na rozhlas",
  "Jsme tu pro špičkovou žurnalistiku",
  "Špička evropské žurnalistiky",
  "Na špičce jehly",
  "Pozdrav z Pičína",
  "Pičín je za média",
  "Žádná sranda s demokracií",
  "Srandu si dělejte jinde",
  "Každá sekunda se počítá",
  "Smrdí to cenzurou",
  "Tady to smrdí",
  "Kundera by se styděl",
  "Čtěte Kunderu",
  "Picasso maloval svobodu",
  "Epicentrum svobody je tady",
  "Sérum proti dezinformacím",
  "Negramotnost není program",
  "Negrelliho viadukt drží",
  "Integrace, ne izolace",
  "Spící demokracie se probouzí",
  "Volební sliby se mají plnit",
  "Svobodná vůle občanů",
  "Fakt nám na tom záleží",
  "Fakulta žurnalistiky je s námi",
  "Faktura za svobodu",
  "Kuba není náš vzor",
  "Na sraz!",
  "Všichni na sraz v neděli",
  "Pak urvali všechno",
  "Kurýr zpráv",
  "Hospic pro starou politiku? Ne",
  "Insulin pro demokracii",
  "Retardér na cestě k cenzuře",
  "Šibal by se smál",
  "Debata místo nařízení",
  "Zastřešení médií státem ne",
  "Zabijačka demokracie? Ne!",
  "Holka, kluk, babička – všichni tu jsme",
  "Mám rád Pikachu i zprávy",
  "Ať žije Český rozhlas",
  "Nebojte se pravdy",
  "Kontrola moci je práce médií",
  "Hlídací pes demokracie",
  "ČT24 nechte na pokoji",
  "Chceme 8,5 mld na média",
  "Rozpočet 1 000 000 000 Kč nestačí",
  "100 let rozhlasu",
  "Jsem tu za babičku 👵",
  "Svoboda ❤️ 🇨🇿",
  "S. P. Q. R. – senát a lid",
  "Média = kontrola moci",
  "Pravda + láska",
  "Smysl pro humor nám zůstal",
  "Opravdu? To myslíte vážně?",
  "Dost. To stačí.",
  "Konec dezinformací!",
  "Za vším hledej peníze",
  "Svobodu nám nevezmou",
  "Seriál o svobodě",
  "Sereď je s námi",
  "Klasa, pasák, basa",
  "Integrita nadevše",
  "Opice ve vládě? Ne",
  "Úpice je s námi",
  "Kopice dezinformací",
  "Soustředit se na pravdu",
  "Mediální soustava funguje",
  "Tropical news are fake",
  "Typical politics",
  "Sekundární problém",
  "Pickup zpráv",
];

describe("allowlist – neutrální slogany projdou", () => {
  it(`projde všech ${NEUTRAL.length} sloganů`, () => {
    const rejected = NEUTRAL.filter((t) => !slogan(t).ok);
    expect(rejected).toEqual([]);
  });
});

describe("předvolby sloganů (content/demonstrace/slogans.yaml)", () => {
  const file = path.join(process.cwd(), "content", "demonstrace", "slogans.yaml");
  it.skipIf(!existsSync(file))("všechny předvolby i seedové vlastní slogany projdou skriptem", () => {
    const raw = parse(readFileSync(file, "utf8")) as unknown;
    const texts: string[] = [];
    const collect = (v: unknown) => {
      if (typeof v === "string") return;
      if (Array.isArray(v)) v.forEach((x) => (typeof x === "string" ? texts.push(x) : collect(x)));
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.text === "string") texts.push(o.text);
        Object.values(o).forEach(collect);
      }
    };
    collect(raw);
    expect(texts.length).toBeGreaterThan(5);
    expect(texts.filter((t) => !slogan(t).ok)).toEqual([]);
  });
});

describe("odkazy, kontakty, přezdívky, hashtagy", () => {
  it.each([
    "Více na www.pravda.cz",
    "https://example.com",
    "Pište na info@spolek.cz",
    "seznam.cz",
    "seznam tečka cz",
    "seznam (dot) com",
    "Volejte 777 123 456",
    "+420 777123456",
    "tel. 777-123-456",
    "Sledujte @spolek",
    "#mediaprovsechny",
    "Přidej se #ČT",
  ])("odmítne %s", (t) => {
    expect(hasContactOrLink(t)).toBe(true);
    expect(slogan(t)).toEqual({ ok: false });
  });
  it.each(["Dost. To stačí.", "Rozpočet 1 000 000 000 Kč", "100 % pro média", "Média & demokracie", "Rok 2026 rozhodne"])(
    "nechá projít %s",
    (t) => expect(hasContactOrLink(t)).toBe(false),
  );
});

describe("slogan – pravidla délky, velkých písmen a emoji", () => {
  it("3–40 znaků", () => {
    expect(slogan("Ne")).toEqual({ ok: false });
    expect(slogan("Ano")).toEqual({ ok: true, text: "Ano" });
    expect(slogan("a".repeat(41))).toEqual({ ok: false });
    expect(slogan("Svoboda médií je základ demokracie, ano!").ok).toBe(true); // 40
  });
  it("ořízne a sjednotí mezery, odstraní neviditelné znaky", () => {
    expect(slogan("  Ruce   pryč​ od ČT \n")).toEqual({ ok: true, text: "Ruce pryč od ČT" });
  });
  it("bez písmen neprojde", () => {
    expect(slogan("!!!")).toEqual({ ok: false });
    expect(slogan("👍👍")).toEqual({ ok: false });
  });
  it("> 50 % velkých písmen → velké jen začátky vět", () => {
    expect(slogan("RUCE PRYČ OD MÉDIÍ")).toEqual({ ok: true, text: "Ruce pryč od médií" });
    expect(slogan("ŽÁDNÁ CENZURA! SVOBODA!")).toEqual({ ok: true, text: "Žádná cenzura! Svoboda!" });
    expect(fixShouting("ČT a ČRo")).toBe("Čt a čro");
    expect(fixShouting("ČT patří nám")).toBe("ČT patří nám"); // 2 z 10 velkých
  });
  it("max. 2 emoji", () => {
    expect(countEmoji("Svoboda ❤️ 🇨🇿")).toBe(2);
    expect(countEmoji("👨‍👩‍👧")).toBe(3);
    expect(slogan("Svoboda ❤️❤️").ok).toBe(true);
    expect(slogan("Svoboda ❤️❤️❤️")).toEqual({ ok: false });
    expect(slogan("Svoboda 🇨🇿🇨🇿🇨🇿")).toEqual({ ok: false });
  });
  it("nevrací důvod odmítnutí", () => {
    expect(Object.keys(slogan("kurva"))).toEqual(["ok"]);
  });
});

describe("jméno", () => {
  it.each(["Jana", "Ondřej", "Žofie", "Anna-Marie", "Jean-Luc", "Zdeněk", "Ťapka", "Al", "Mohamed", "Nguyen", "Pavel", "Vojtěch", "Martin", "Petr", "Marie"])(
    "povolí %s",
    (t) => expect(name(t)).toEqual({ ok: true, text: t }),
  );
  it("ořízne mezery kolem", () => {
    expect(name("  Jana ")).toEqual({ ok: true, text: "Jana" });
  });
  it.each([
    "J",
    "A".repeat(21),
    "Jana Nováková",
    "Jana2",
    "Jan_a",
    "-Jana",
    "Jana-",
    "Jana--Marie",
    "Jan.",
    "Иван",
    "Jаna", // cyrilské а
    "😀Jana",
  ])("odmítne tvar %s", (t) => expect(name(t)).toEqual({ ok: false }));
  it.each(["Babiš", "babis", "BABIŠ", "Klempíř", "Klempir", "Okamura", "Fiala", "Rakušan", "Zeman", "Putin", "Trump", "Hitler", "Anonym", "Admin", "Moderátor", "Jana-Okamura", "Schillerová", "Havlíček", "Macinka"])(
    "odmítne veřejně známé jméno %s",
    (t) => {
      expect(name(t)).toEqual({ ok: false });
    },
  );
});
