import { describe, expect, it } from "vitest";
import { countWords, findBannedTerms, splitSentences } from "./text";

describe("text limits", () => {
  it("countWords ignoruje samostatnou interpunkci", () => {
    expect(countWords("Dnes +10 %")).toBe(2);
    expect(countWords("Zákon, s růstem podle inflace")).toBe(5);
  });
  it("splitSentences respektuje zkratky", () => {
    expect(splitSentences("Je to asi 7,8 mld. Kč ročně. Druhá věta.")).toHaveLength(2);
    expect(splitSentences("Např. Švédsko. Finsko!")).toHaveLength(2);
  });
  it("findBannedTerms najde ohnuté tvary", () => {
    const terms = [{ term: "valorizace" }, { term: "mandatorní výdaj" }];
    expect(findBannedTerms("Bez valorizací.", terms).map((t) => t.term)).toEqual(["valorizace"]);
    expect(findBannedTerms("Jde o mandatorní výdaje státu.", terms).map((t) => t.term)).toEqual(["mandatorní výdaj"]);
    expect(findBannedTerms("Nic takového.", terms)).toEqual([]);
  });
});
