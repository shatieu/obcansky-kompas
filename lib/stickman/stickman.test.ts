import { describe, expect, it } from "vitest";
import {
  figureGeometry,
  generateStickman,
  HAIR_STYLES,
  HEAD_LIMITS,
  layoutSignText,
  loopMs,
  LOOP_MAX,
  LOOP_MIN,
  poseAt,
  POSES,
  RANGES,
  SIGN_COLORS,
  SIGN_MAX_LINES,
  SIGN_SHAPES,
  stickmanLayout,
  stickmanSvg,
  type StickmanParams,
} from "./index";

const SEEDS = Array.from({ length: 3000 }, (_, i) => (i * 2654435761) >>> 0);

describe("generateStickman", () => {
  it("je deterministický (stejný seed = stejné parametry)", () => {
    for (const s of SEEDS.slice(0, 200)) expect(generateStickman(s)).toEqual(generateStickman(s));
    expect(generateStickman(1)).not.toEqual(generateStickman(2));
  });

  it("drží proměnné v rozsazích a pokryje všechny varianty", () => {
    const hair = new Set<string>();
    const shapes = new Set<string>();
    let scarf = 0;
    let glasses = 0;
    for (const s of SEEDS) {
      const p = generateStickman(s);
      for (const k of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
        expect(p[k]).toBeGreaterThanOrEqual(RANGES[k][0]);
        expect(p[k]).toBeLessThanOrEqual(RANGES[k][1]);
      }
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThan(1);
      hair.add(p.hair);
      shapes.add(p.signShape);
      if (p.scarf) scarf++;
      if (p.glasses) glasses++;
    }
    expect([...hair].sort()).toEqual([...HAIR_STYLES].sort());
    expect([...shapes].sort()).toEqual([...SIGN_SHAPES].sort());
    // Šála je malá šance.
    expect(scarf / SEEDS.length).toBeGreaterThan(0.03);
    expect(scarf / SEEDS.length).toBeLessThan(0.15);
    expect(glasses).toBeGreaterThan(0);
  });

  it("přijme i seed mimo uint32 (ořízne)", () => {
    expect(generateStickman(2 ** 32 + 5)).toEqual(generateStickman(5));
  });
});

describe("animace", () => {
  it("smyčka je 1,2–2,4 s pro každou pózu a rychlost", () => {
    for (const s of SEEDS.slice(0, 300))
      for (const pose of POSES) {
        const ms = loopMs(generateStickman(s), pose);
        expect(ms).toBeGreaterThanOrEqual(LOOP_MIN);
        expect(ms).toBeLessThanOrEqual(LOOP_MAX);
      }
  });

  it("póza je periodická a fáze ze seedu rozhazuje dav", () => {
    const p = generateStickman(42);
    for (const pose of POSES) {
      const a = poseAt(p, pose, 777);
      const b = poseAt(p, pose, 777 + loopMs(p, pose));
      expect(b.armL[0]).toBeCloseTo(a.armL[0], 6);
      expect(b.legR[1]).toBeCloseTo(a.legR[1], 6);
      expect(b.lift).toBeCloseTo(a.lift, 6);
    }
    const q = generateStickman(43);
    expect(poseAt(p, "mava", 500).armL[0]).not.toBeCloseTo(poseAt(q, "mava", 500).armL[0], 3);
  });

  it("chodidla stojí na zemi, skok zvedá postavu nad ni", () => {
    const p = generateStickman(9);
    for (const pose of POSES) {
      for (let t = 0; t < 2400; t += 97) {
        const f = figureGeometry(p, poseAt(p, pose, t));
        const feet = Math.max(f.body[1]!.y2, f.body[3]!.y2);
        if (pose === "skace") expect(feet).toBeLessThanOrEqual(1e-9);
        else expect(feet).toBeCloseTo(0, 9);
      }
    }
  });

  it("meze hlavy pro rozvržení davu platí v klidové póze", () => {
    for (const s of SEEDS.slice(0, 1500)) {
      const p = generateStickman(s);
      for (const pose of POSES) {
        const f = figureGeometry(p, poseAt(p, pose));
        expect(-f.head.y).toBeGreaterThanOrEqual(HEAD_LIMITS.centerMin - 1e-6);
        expect(-f.head.y).toBeLessThanOrEqual(HEAD_LIMITS.centerMax + 1e-6);
        expect(f.head.r).toBeLessThanOrEqual(HEAD_LIMITS.rMax + 1e-9);
      }
    }
  });
});

describe("cedule", () => {
  it("zalomí do max. 3 řádků a zmenší písmo u delšího textu", () => {
    for (const shape of SIGN_SHAPES) {
      const short = layoutSignText("Tady stojíme", shape);
      const long = layoutSignText("Veřejnoprávní média mi nejsou jedno", shape);
      expect(short.lines.length).toBeLessThanOrEqual(SIGN_MAX_LINES);
      expect(long.lines.length).toBeLessThanOrEqual(SIGN_MAX_LINES);
      expect(long.fontSize).toBeLessThanOrEqual(short.fontSize);
      expect(long.lines.join(" ")).toBe("Veřejnoprávní média mi nejsou jedno");
    }
  });

  it("40 znaků bez mezer se vejde (tvrdé zalomení)", () => {
    const t = "A".repeat(40);
    for (const shape of SIGN_SHAPES) {
      const l = layoutSignText(t, shape);
      expect(l.lines.length).toBeLessThanOrEqual(SIGN_MAX_LINES);
      expect(l.lines.join("").replace("…", "").length).toBeGreaterThan(10);
    }
  });
});

describe("stickmanSvg", () => {
  const p = generateStickman(123456789);

  it("snapshot (stejný seed = stejné SVG)", () => {
    const a = stickmanSvg(p, { pose: "drzi", signColor: "white", signText: "Ruce pryč od médií" });
    expect(a).toBe(stickmanSvg(generateStickman(123456789), { pose: "drzi", signColor: "white", signText: "Ruce pryč od médií" }));
    expect(a).toMatchSnapshot();
    expect(stickmanSvg(p, { pose: "pest", t: 640, signColor: "red", signText: "Média nedáme", title: "Panáček" })).toMatchSnapshot();
  });

  it("vykreslí všechny pózy, barvy, tvary a doplňky bez chyby", () => {
    const base = generateStickman(1);
    for (const pose of POSES)
      for (const signColor of SIGN_COLORS)
        for (const signShape of SIGN_SHAPES)
          for (const hair of HAIR_STYLES)
            for (const flags of [
              { glasses: false, scarf: false },
              { glasses: true, scarf: true },
            ]) {
              const params: StickmanParams = { ...base, signShape, hair, ...flags };
              for (const t of [undefined, 0, 333, 1999]) {
                const svg = stickmanSvg(params, { pose, t, signColor, signText: "Za nezávislá veřejná média" });
                expect(svg).not.toMatch(/NaN|undefined|Infinity/);
                expect(svg.startsWith("<svg")).toBe(true);
                expect((svg.match(/<g[ >]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
                if (flags.scarf) expect(svg).toContain("#D7141A");
              }
            }
  });

  it("escapuje text cedule", () => {
    const svg = stickmanSvg(p, { pose: "drzi", signColor: "blue", signText: `<script>"&'` });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&quot;&amp;&#39;");
  });

  it("stickmanLayout vrací text cedule pro samostatnou sazbu (next/og)", () => {
    const l = stickmanLayout(p, { pose: "drzi", signText: "Média nedáme" });
    expect(l.text).not.toBeNull();
    if (!l.text) return;
    expect(l.text.lines.length).toBeGreaterThan(0);
    expect(l.text.fontSize).toBeGreaterThan(0);
    expect(Number.isFinite(l.text.x + l.text.y)).toBe(true);
  });
});

describe("bez cedule (sign_color none)", () => {
  const p = generateStickman(1234);
  it("nekreslí ceduli, tyče ani text a ruce nejsou nad hlavou u všech póz stejně", () => {
    for (const pose of POSES) {
      const fig = figureGeometry(p, poseAt(p, pose, 500, false));
      expect(fig.sign).toBeNull();
      expect(fig.poles).toHaveLength(0);
      const svg = stickmanSvg(p, { pose, signColor: "none", signText: "Nemá být vidět" });
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain("Nemá být vidět");
      expect(svg).not.toContain("<line");
    }
  });
  it("pěst je zdvižená a tleskání má ruce u sebe", () => {
    const fist = figureGeometry(p, poseAt(p, "pest", 0, false));
    expect(fist.fist).not.toBeNull();
    expect(fist.fist!.y).toBeLessThan(fist.head.y);
    const clap = figureGeometry(p, poseAt(p, "tleska", undefined, false));
    // body[8] = loket→ruka vlevo, body[10] = loket→ruka vpravo; při tlesknutí jsou dlaně u sebe
    const t = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200].map((ms) => figureGeometry(p, poseAt(p, "tleska", ms, false)));
    const gap = Math.min(...t.map((f) => Math.abs(f.body[8]!.x2 - f.body[10]!.x2)));
    expect(gap).toBeLessThan(12);
    expect(clap.sign).toBeNull();
  });
  it("stickmanLayout bez cedule vrací text null", () => {
    expect(stickmanLayout(p, { pose: "mava", signText: "x", signColor: "none" }).text).toBeNull();
  });
});

describe("póza klíče (klice)", () => {
  it("všechny pózy s cedulí i bez: geometrie bez NaN, SVG bez NaN", () => {
    for (const seed of [1, 99, 123456, 4294967295]) {
      const p = generateStickman(seed);
      for (const pose of POSES)
        for (const color of SIGN_COLORS)
          for (const t of [undefined, 0, 333, 1717]) {
            const fig = figureGeometry(p, poseAt(p, pose, t, color !== "none"));
            expect(JSON.stringify(fig)).not.toMatch(/NaN|null,"y"/);
            expect(stickmanSvg(p, { pose, t, signColor: color, signText: "Média nedáme" })).not.toContain("NaN");
          }
    }
  });
  it("klíče jsou v levé ruce nad hlavou a cinkají; s cedulí i bez", () => {
    const p = generateStickman(77);
    for (const withSign of [true, false]) {
      const a = figureGeometry(p, poseAt(p, "klice", 0, withSign));
      const angles = [0, 150, 300, 450].map((t) => figureGeometry(p, poseAt(p, "klice", t, withSign)).keys!.angle);
      expect(a.keys).not.toBeNull();
      expect(a.keys!.y).toBeLessThan(a.head.y);
      expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(10);
      expect(a.sign === null).toBe(!withSign);
    }
    expect(stickmanSvg(p, { pose: "klice", signColor: "blue", signText: "" })).toContain("<circle r=\"2.6\"");
    expect(figureGeometry(p, poseAt(p, "pest", 0)).keys).toBeNull();
  });
});
