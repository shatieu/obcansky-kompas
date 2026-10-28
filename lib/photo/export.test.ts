import { describe, expect, it } from "vitest";
import { VARIANTS } from "./constants";
import { exportFileName, exportPlan, frameEvent, isVariant, pickSlogan, previewPixels } from "./export";
import { loadSlogans } from "./content";

describe("export", () => {
  it("vždy 1080 × 1080, PNG i JPG", () => {
    expect(exportPlan("png")).toMatchObject({ width: 1080, height: 1080, mime: "image/png" });
    expect(exportPlan("jpg")).toMatchObject({ width: 1080, height: 1080, mime: "image/jpeg", opaque: true });
    expect(exportPlan("jpg").quality).toBeGreaterThan(0.8);
    // PNG nechá prázdné rohy kruhu průhledné, JPG je vyplní (bíle, render.ts)
    expect(exportPlan("png").opaque).toBe(false);
  });

  it("náhled: CSS × DPR, max. 1080", () => {
    expect(previewPixels(320, 2)).toBe(640);
    expect(previewPixels(600, 3)).toBe(1080);
    expect(previewPixels(320, NaN)).toBe(320);
    expect(previewPixels(0, 1)).toBe(1);
  });

  it("název souboru bez osobních údajů", () => {
    expect(exportFileName("ring", "media-nedame", "png")).toBe("profilova-fotka-ring-media-nedame.png");
    expect(exportFileName("corner", "media-nedame", "jpg")).toBe("profilova-fotka-corner.jpg");
  });
});

describe("slogany jen ze slogans.yaml", () => {
  const slogans = loadSlogans();
  it("tři slogany ze SPEC §9.3", () => {
    expect(slogans.map((s) => s.text)).toEqual([
      "Ruce pryč od médií",
      "Média nedáme",
      "Veřejnoprávní média mi nejsou jedno",
    ]);
  });
  it("neznámé id → první slogan", () => {
    expect(pickSlogan(slogans, "neexistuje").id).toBe(slogans[0]!.id);
    expect(pickSlogan(slogans, "media-nedame").text).toBe("Média nedáme");
  });
});

describe("anonymní událost", () => {
  it("jen varianta a slogan; roh bez sloganu", () => {
    expect(frameEvent("ring", "ruce-pryc")).toEqual({ kind: "frame_downloaded", variant: "ring", slogan: "ruce-pryc" });
    expect(frameEvent("corner", "ruce-pryc")).toEqual({ kind: "frame_downloaded", variant: "corner", slogan: "none" });
  });
  it("varianty", () => {
    expect(VARIANTS.every(isVariant)).toBe(true);
    expect(isVariant("foo")).toBe(false);
  });
});
