import { describe, expect, it } from "vitest";
import { assertNoSeedInProduction, shouldCheckSeed } from "./start-guard";

const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x@127.0.0.1:1/x", DEMO_MODE: "0" } as NodeJS.ProcessEnv;

describe("§14.3 start guard", () => {
  it("kontroluje jen produkci s DB, mimo build a bez DEMO_MODE", () => {
    expect(shouldCheckSeed(prod)).toBe(true);
    expect(shouldCheckSeed({ ...prod, DEMO_MODE: "1" })).toBe(false);
    expect(shouldCheckSeed({ ...prod, NODE_ENV: "development" })).toBe(false);
    expect(shouldCheckSeed({ ...prod, DATABASE_URL: undefined })).toBe(false);
    expect(shouldCheckSeed({ ...prod, NEXT_PHASE: "phase-production-build" })).toBe(false);
  });

  it("nedostupná DB start nezastaví (degradace §14.2)", async () => {
    await expect(assertNoSeedInProduction(prod)).resolves.toBeUndefined();
  });
});
