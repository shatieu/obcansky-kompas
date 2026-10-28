import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { MAX_REROLLS, TILE_SIZE, type TileItem } from "@/lib/demo/constants";
import { scriptCheck } from "@/lib/moderation/script";
import { maxIndexOf, PAGE_SIZE, pageCount, pageItems, pageRange, parsePage } from "../list/pagination";
import { countLine } from "./stance-count";
import {
  canReroll,
  draftFromOwn,
  firstInvalid,
  initialDraft,
  navStates,
  nextStep,
  payload,
  prevStep,
  reroll,
  rerollsLeft,
  signText,
  stepError,
  STEPS,
  visibleStatus,
  type CheckText,
} from "./state";
import { demoTextsSchema } from "./texts";

const okCheck: CheckText = () => true;
const realCheck: CheckText = (t, f) => scriptCheck(t, f).ok;
const presets = { "ruce-pryc": "Ruce pryč od médií", "nejsou-jedno": "Média veřejné služby mi nejsou jedno" };

describe("texty demonstrace v ui.yaml", () => {
  it("odpovídají schématu a souhlas má doslovné znění ze SPEC", () => {
    const raw = parse(readFileSync(path.join(process.cwd(), "content", "ui.yaml"), "utf8"));
    const t = demoTextsSchema.parse(raw.demonstrace);
    expect(t.join.consent_label).toBe("Souhlasím se zveřejněním svého sloganu a případně křestního jména");
    expect(t.join.moderation).toBe("Tento text nelze použít. Zkuste jiný.");
    expect(t.join.reroll_button).toBe("Jiný panáček");
    expect(t.join.name_anonymous).toBe("Připojit se anonymně");
    expect(t.stance_join_label).toBe("Připojit se k demonstraci");
    expect(t.page_mine_label).toBe("Můj panáček v davu");
  });
});

describe("kroky", () => {
  it("jdou v pořadí slogan → … → souhlas", () => {
    expect(STEPS).toEqual(["slogan", "pose", "color", "look", "name", "consent"]);
    expect(nextStep("slogan")).toBe("pose");
    expect(nextStep("consent")).toBeNull();
    expect(prevStep("slogan")).toBeNull();
    expect(prevStep("name")).toBe("look");
  });

  it("výchozí stav: předvolba, anonymně, bez souhlasu", () => {
    const d = initialDraft("nejsou-jedno", 42);
    expect(d).toMatchObject({ sloganMode: "preset", presetId: "nejsou-jedno", showName: false, consent: false, rerollCount: 0, seed: 42 });
    expect(firstInvalid(d, okCheck)).toEqual({ step: "consent", error: "consent" });
  });

  it("slogan: prázdný vlastní text, moc dlouhý nebo zakázaný = chyba", () => {
    const d = { ...initialDraft("ruce-pryc", 1), sloganMode: "custom" as const };
    expect(stepError("slogan", { ...d, custom: "   " }, okCheck)).toBe("slogan_empty");
    expect(stepError("slogan", { ...d, custom: "x".repeat(41) }, okCheck)).toBe("moderation_slogan");
    expect(stepError("slogan", { ...d, custom: "Za nezávislé novináře" }, realCheck)).toBeNull();
    expect(stepError("slogan", { ...d, custom: "k.r.e.t.e.n" }, realCheck)).toBe("moderation_slogan");
    expect(stepError("slogan", { ...d, custom: "Pište na www.example.cz" }, realCheck)).toBe("moderation_slogan");
  });

  it("jméno: anonymně bez kontroly, jinak jedno slovo přes scriptCheck", () => {
    const d = initialDraft("ruce-pryc", 1);
    expect(stepError("name", d, () => false)).toBeNull();
    expect(stepError("name", { ...d, showName: true, firstName: "" }, okCheck)).toBe("name_empty");
    expect(stepError("name", { ...d, showName: true, firstName: "Jana" }, realCheck)).toBeNull();
    expect(stepError("name", { ...d, showName: true, firstName: "Babiš" }, realCheck)).toBe("moderation_name");
  });

  it("navigace: navštívené bez chyby = hotovo, aktuální zvlášť", () => {
    const d = initialDraft("ruce-pryc", 1);
    const s = navStates("look", new Set(["slogan", "pose", "look", "consent"]), d, okCheck);
    expect(s).toEqual(["done", "done", "todo", "current", "todo", "todo"]);
  });
});

describe("Jiný panáček", () => {
  it("mění seed a počítá změny, po 20 zůstane poslední", () => {
    let n = 0;
    const rand = () => 1000 + n++;
    let d = initialDraft("ruce-pryc", 7);
    const seeds = new Set([d.seed]);
    for (let i = 0; i < 30; i++) {
      d = reroll(d, rand);
      seeds.add(d.seed);
    }
    expect(d.rerollCount).toBe(MAX_REROLLS);
    expect(seeds.size).toBe(MAX_REROLLS + 1);
    expect(canReroll(d)).toBe(false);
    expect(rerollsLeft(d)).toBe(0);
    const last = d.seed;
    expect(reroll(d, rand).seed).toBe(last);
  });

  it("nový seed se nikdy neshoduje se starým a je 32bit", () => {
    const d = initialDraft("ruce-pryc", 5);
    const r = reroll(d, () => 5);
    expect(r.seed).not.toBe(5);
    const big = reroll(d, () => 2 ** 32 + 3);
    expect(big.seed).toBeGreaterThanOrEqual(0);
    expect(big.seed).toBeLessThanOrEqual(0xffffffff);
  });

  it("výchozí zdroj je crypto", () => {
    const r = reroll(initialDraft("ruce-pryc", 5));
    expect(Number.isInteger(r.seed)).toBe(true);
    expect(r.rerollCount).toBe(1);
  });
});

describe("odeslání", () => {
  it("předvolba: sloganPresetId, bez jména, souhlas true", () => {
    const d = { ...initialDraft("ruce-pryc", 9), consent: true, firstName: "Jana" };
    expect(payload(d)).toEqual({ sloganPresetId: "ruce-pryc", pose: "drzi", signColor: "white", seed: 9, rerollCount: 0, firstName: null, consent: true });
  });

  it("vlastní slogan a jméno se ořežou", () => {
    const d = { ...initialDraft("ruce-pryc", 9), sloganMode: "custom" as const, custom: "  Za   rádio ", showName: true, firstName: " Jana ", consent: true };
    const p = payload(d);
    expect(p).toMatchObject({ sloganCustom: "Za rádio", firstName: "Jana" });
    expect("sloganPresetId" in p).toBe(false);
  });

  it("náhled cedule: vlastní text, jinak předvolba", () => {
    const d = initialDraft("ruce-pryc", 1);
    expect(signText(d, presets)).toBe("Ruce pryč od médií");
    expect(signText({ ...d, sloganMode: "custom", custom: "Ahoj" }, presets)).toBe("Ahoj");
    expect(signText({ ...d, sloganMode: "custom", custom: " " }, presets)).toBe("Ruce pryč od médií");
  });
});

describe("úprava", () => {
  const own = { sloganPresetId: null, sloganCustom: "Za rádio", firstName: "Jana", rerollCount: 25 };
  it("předvyplní volby, souhlas znovu, změny max. 20", () => {
    const d = draftFromOwn({ seed: 3, pose: "skace", signColor: "red" }, own, "nejsou-jedno");
    expect(d).toMatchObject({ sloganMode: "custom", custom: "Za rádio", showName: true, firstName: "Jana", pose: "skace", signColor: "red", seed: 3, consent: false });
    expect(d.rerollCount).toBe(MAX_REROLLS);
  });

  it("štítek stavu jen u nezměněného textu", () => {
    expect(visibleStatus("pending", "Za rádio", "Za rádio")).toBe("pending");
    expect(visibleStatus("rejected", "Za rádio", " Za  rádio ")).toBe("rejected");
    expect(visibleStatus("rejected", "Za rádio", "Jiný text")).toBeNull();
    expect(visibleStatus("approved", "Za rádio", "Za rádio")).toBeNull();
    expect(visibleStatus("pending", null, "")).toBeNull();
  });
});

describe("seznam: stránkování", () => {
  const item = (i: number): TileItem => [i, i, "drzi", "white", "p:ruce-pryc", null, `id-${i}`, "2026-10-28"];
  it("počet stránek a meze", () => {
    expect(pageCount(null)).toBe(0);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE - 1)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(2);
    expect(parsePage("3", 2)).toBe(2);
    expect(parsePage("abc", 5)).toBe(1);
    expect(parsePage(["4"], 5)).toBe(4);
    expect(parsePage("0", 5)).toBe(1);
  });
  it("stránka leží v jedné dlaždici a vrací seřazené položky s mezerami", () => {
    expect(TILE_SIZE % PAGE_SIZE).toBe(0);
    expect(pageRange(21)).toEqual({ lo: 1000, hi: 1000 + PAGE_SIZE, tile: 1 });
    const items = [item(PAGE_SIZE + 5), item(3), item(PAGE_SIZE + 40), item(PAGE_SIZE - 1), item(0)];
    expect(pageItems(items, 1).map((x) => x[0])).toEqual([0, 3, PAGE_SIZE - 1]);
    expect(pageItems(items, 2).map((x) => x[0])).toEqual([PAGE_SIZE + 5, PAGE_SIZE + 40]);
    expect(maxIndexOf(items)).toBe(PAGE_SIZE + 40);
    expect(maxIndexOf([])).toBeNull();
  });
});

describe("blok postoje: počet", () => {
  const t = { one: "{count} člověk", few: "{count} lidé", many: "{count} lidí", zero: "Nikdo" };
  it("tvary podle počtu a nezlomitelné mezery", () => {
    expect(countLine(0, t)).toBe("Nikdo");
    expect(countLine(1, t)).toBe("1 člověk");
    expect(countLine(3, t)).toBe("3 lidé");
    expect(countLine(2481, t)).toBe("2 481 lidí");
  });
});
