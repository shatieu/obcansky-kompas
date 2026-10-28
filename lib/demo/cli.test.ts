import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidateOrFail } from "./cli";

/* Zásah z CLI bez zneplatnění cache není zásah (bezpečnostní review): přeskočení i selhání = exit 2. */

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("revalidateOrFail", () => {
  it("bez NEXT_PUBLIC_SITE_URL / CRON_SECRET → false a exitCode 2", async () => {
    quiet();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.CRON_SECRET;
    expect(await revalidateOrFail("demo:hide", ["demo-tile:0"], [])).toBe(false);
    expect(process.exitCode).toBe(2);
  });

  it("--no-revalidate → true bez volání", async () => {
    quiet();
    const f = vi.fn();
    expect(await revalidateOrFail("demo:hide", ["demo-tile:0"], ["--no-revalidate"], f as unknown as typeof fetch)).toBe(true);
    expect(f).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("volá endpoint s tagy po dávkách, selhání → exitCode 2", async () => {
    quiet();
    process.env.NEXT_PUBLIC_SITE_URL = "https://kompas.test/";
    process.env.CRON_SECRET = "s";
    const calls: string[][] = [];
    const ok = (async (_u: string, init: RequestInit) => {
      calls.push((JSON.parse(String(init.body)) as { tags: string[] }).tags);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const tags = Array.from({ length: 150 }, (_, i) => `demo-tile:${i}`);
    expect(await revalidateOrFail("moderation:recheck", [...tags, "demo-tile:0"], [], ok)).toBe(true);
    expect(calls.map((c) => c.length)).toEqual([100, 50]);
    expect(process.exitCode).toBeUndefined();

    const bad = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await revalidateOrFail("demo:hide", ["demo-tile:0"], [], bad)).toBe(false);
    expect(process.exitCode).toBe(2);
  });
});
