import { afterEach, describe, expect, it } from "vitest";
import { TEST_SECRET_KEY, verifyTurnstile } from "./index";

const prev = { ...process.env };
afterEach(() => {
  process.env = { ...prev };
});

const fakeFetch = (success: boolean, seen: { body?: string } = {}) =>
  (async (_url: unknown, init?: RequestInit) => {
    seen.body = String(init?.body);
    return Response.json({ success });
  }) as typeof fetch;

describe("verifyTurnstile", () => {
  it("bez tokenu neprojde a nevolá síť", async () => {
    expect(await verifyTurnstile("", { fetchImpl: fakeFetch(true) })).toEqual({ ok: false, reason: "missing-token" });
    expect(await verifyTurnstile(undefined, { fetchImpl: fakeFetch(true) })).toEqual({ ok: false, reason: "missing-token" });
  });

  it("posílá secret a token, respektuje verdikt", async () => {
    process.env.TURNSTILE_SECRET_KEY = "real-secret";
    const seen: { body?: string } = {};
    expect(await verifyTurnstile("tok", { fetchImpl: fakeFetch(true, seen) })).toEqual({ ok: true });
    expect(seen.body).toContain("secret=real-secret");
    expect(seen.body).toContain("response=tok");
    expect(await verifyTurnstile("tok", { fetchImpl: fakeFetch(false) })).toEqual({ ok: false, reason: "rejected" });
  });

  it("výpadek sítě: s ostrým klíčem neprojde, s testovacím ano", async () => {
    const broken = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    process.env.TURNSTILE_SECRET_KEY = "real-secret";
    expect(await verifyTurnstile("tok", { fetchImpl: broken })).toEqual({ ok: false, reason: "network" });
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET_KEY;
    expect(await verifyTurnstile("tok", { fetchImpl: broken })).toEqual({ ok: true });
  });
});
