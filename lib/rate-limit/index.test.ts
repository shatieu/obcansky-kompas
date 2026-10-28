import { describe, expect, it } from "vitest";
import { daySalt, ipKey, windowStart } from "./index";

describe("rate-limit", () => {
  it("windowStart zarovná na celou hodinu", () => {
    const d = new Date("2026-10-28T13:47:12.345Z");
    expect(windowStart(d, 3600).toISOString()).toBe("2026-10-28T13:00:00.000Z");
    expect(windowStart(new Date("2026-10-28T13:00:00.000Z"), 3600).toISOString()).toBe("2026-10-28T13:00:00.000Z");
  });

  it("IP klíč je HMAC: neobsahuje IP, je stabilní během dne a jiný další den", () => {
    const ip = "203.0.113.7";
    const a = ipKey(ip, new Date("2026-10-28T01:00:00Z"));
    const b = ipKey(ip, new Date("2026-10-28T23:00:00Z"));
    const c = ipKey(ip, new Date("2026-10-29T00:00:01Z"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain(ip);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(daySalt(new Date("2026-10-28T23:59:59Z"))).toBe("2026-10-28");
  });
});
