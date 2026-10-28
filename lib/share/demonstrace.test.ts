import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import type { TileItem } from "@/lib/demo/constants";
import { cardShareText } from "./card";
import { CROWD_MAX, demoCountLine, demonstraceCard, demoScene, neighborsFromTile, syntheticCrowd } from "./demonstrace";
import { layoutCard, type DrawOp } from "./layout";
import { isMoment, ogImagePath, shareSentence } from "./moments";
import { fgSignText, OG_DEMO_BOX, sceneSvg } from "./og";
import { shareTextsSchema } from "./texts";
import { FORMATS } from "./style";

const uiRaw = parse(readFileSync(path.join(process.cwd(), "content", "ui.yaml"), "utf8"));
const img = shareTextsSchema.parse({ share: uiRaw.share, compare_page: uiRaw.compare_page }).share.image;

const person = { seed: 123456, pose: "mava" as const, signColor: "red" as const, signText: "Ruce pryč od médií", name: "Jana" };

describe("moment demonstrace", () => {
  it("má větu ze SPEC a OG cestu s id panáčka", () => {
    expect(isMoment("demonstrace")).toBe(true);
    expect(shareSentence("demonstrace")).toBe("Připojil/a jsem se k online demonstraci");
    expect(ogImagePath("demonstrace", { id: "abc", v: "1" })).toBe("/api/og/demonstrace?id=abc&v=1");
  });

  it("karta: věta, počet, jméno, panáček", () => {
    const c = demonstraceCard(person, 2481, img);
    expect(c.moment).toBe("demonstrace");
    expect(c.headline).toBe("Připojil/a jsem se k online demonstraci");
    expect(cardShareText(c)).toBe(c.headline);
    expect(c.line).toBe("2 481 lidí v davu");
    expect(c.name).toBe("Jana");
    expect(c.figure).toMatchObject({ seed: 123456, pose: "mava", signColor: "red", signText: "Ruce pryč od médií" });
  });

  it("počet: tvary 1 / 2–4 / 5+, bez dat žádný řádek", () => {
    expect(demoCountLine(1, img)).toBe("1 člověk v davu");
    expect(demoCountLine(3, img)).toBe("3 lidé v davu");
    expect(demonstraceCard(person, null, img).line).toBeNull();
    expect(demonstraceCard(person, 0, img).line).toBeNull();
  });

  it("bez jména (anonym, neschválené) je na obrázku jen slogan", () => {
    expect(demonstraceCard({ ...person, name: null }, 5, img).name).toBeNull();
  });
});

describe("scéna", () => {
  const fig = demonstraceCard(person, 10, img).figure!;
  const box = { x: 0, y: 0, w: 600, h: 600 };

  it("je deterministická, popředí kreslené naposled a uvnitř boxu", () => {
    const a = demoScene(fig, box);
    expect(demoScene(fig, box)).toEqual(a);
    expect(a).toHaveLength(CROWD_MAX + 1);
    const fg = a[a.length - 1]!;
    expect(fg.layer).toBe("fg");
    expect(fg.signText).toBe("Ruce pryč od médií");
    expect(a.slice(0, -1).every((p) => p.layer === "crowd" && p.signText === "" && p.scale < fg.scale)).toBe(true);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w + 1);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h);
    }
    // zadní řady (menší) dřív než přední
    const scales = a.map((p) => p.scale);
    expect([...scales].sort((x, y) => x - y)).toEqual(scales);
  });

  it("sousedé z dlaždice: nejbližší indexy bez panáčka samotného", () => {
    const items: TileItem[] = Array.from({ length: 40 }, (_, i) => [i, 1000 + i, "tleska", "blue", "p:x", null, `id${i}`, "2026-10-28"]);
    const n = neighborsFromTile(items, 20);
    expect(n).toHaveLength(CROWD_MAX);
    expect(n.map((x) => x.seed)).not.toContain(1020);
    expect(n[0]!.seed).toBe(1019);
    expect(syntheticCrowd(5)).toEqual(syntheticCrowd(5));
  });
});

describe("Story a čtverec", () => {
  const measure = (t: string, _f: string, size: number) => t.length * size * 0.6;
  const card = demonstraceCard(person, 2481, img);
  for (const format of ["story", "square"] as const) {
    it(`${format}: panáček, dav, vlajka a text uvnitř plochy`, () => {
      const ops = layoutCard(card, format, measure);
      const { width: W, height: H } = FORMATS[format];
      const sticks = ops.filter((o): o is Extract<DrawOp, { t: "stickman" }> => o.t === "stickman");
      expect(sticks).toHaveLength(CROWD_MAX + 1);
      expect(sticks.filter((s) => s.layer === "fg")).toHaveLength(1);
      expect(ops.filter((o) => o.t === "flag")).toHaveLength(1);
      const texts = ops.filter((o): o is Extract<DrawOp, { t: "text" }> => o.t === "text");
      expect(texts.map((t) => t.text).join(" ")).toContain("Jana");
      for (const t of texts) {
        expect(t.y).toBeGreaterThan(0);
        expect(t.y).toBeLessThanOrEqual(H);
        if (t.align === "left") expect(t.x + measure(t.text, t.font, t.size)).toBeLessThanOrEqual(W + 1);
      }
      for (const s of sticks) expect(s.y).toBeLessThanOrEqual(H);
    });
  }
});

describe("OG", () => {
  it("SVG scény nemá text (sází se zvlášť) a text cedule leží v boxu", () => {
    const placed = demoScene(demonstraceCard(person, 1, img).figure!, OG_DEMO_BOX);
    const svg = sceneSvg(placed, OG_DEMO_BOX);
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("Ruce");
    const txt = fgSignText(placed[placed.length - 1]!, OG_DEMO_BOX);
    expect(txt.lines.join(" ")).toBe("Ruce pryč od médií");
    expect(txt.cx).toBeGreaterThan(0);
    expect(txt.cx).toBeLessThan(OG_DEMO_BOX.w);
    expect(txt.cy).toBeGreaterThan(0);
    expect(txt.fontSize).toBeGreaterThan(10);
  });
});
