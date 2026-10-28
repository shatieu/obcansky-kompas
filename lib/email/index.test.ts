import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleProvider, EmailError, fillTemplate, getEmailProvider, redactRecipient, resendProvider, RESEND_URL } from "./index";

afterEach(() => vi.restoreAllMocks());

describe("email adaptér", () => {
  it("console provider neloguje adresu", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "info").mockImplementation((...a: unknown[]) => void logged.push(a.join(" ")));
    await consoleProvider.send({ to: "jana.novakova@seznam.cz", subject: "S", text: "ahoj", kind: "verify" });
    expect(logged.join("\n")).not.toContain("jana.novakova");
    expect(logged.join("\n")).toContain(redactRecipient("jana.novakova@seznam.cz"));
  });

  it("resend: POST přes fetch s klíčem a tělem", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await resendProvider({ apiKey: "re_test", from: "Kompas <k@example.cz>", fetchImpl }).send({ to: "a@b.cz", subject: "S", text: "T", kind: "verify" });
    expect(calls[0]!.url).toBe(RESEND_URL);
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ from: "Kompas <k@example.cz>", to: ["a@b.cz"], subject: "S", text: "T" });
  });

  it("resend: chyba HTTP → EmailError s kódem bez osobních údajů", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    const p = resendProvider({ apiKey: "k", from: "f@x.cz", fetchImpl }).send({ to: "a@b.cz", subject: "S", text: "T", kind: "verify" });
    await expect(p).rejects.toBeInstanceOf(EmailError);
    await expect(p).rejects.toMatchObject({ code: "http_422" });
  });

  it("výběr providera z env", () => {
    expect(getEmailProvider({ EMAIL_PROVIDER: "console" }).name).toBe("console");
    expect(getEmailProvider({}).name).toBe("console");
    expect(getEmailProvider({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "k", EMAIL_FROM: "f@x.cz" }).name).toBe("resend");
    expect(() => getEmailProvider({ EMAIL_PROVIDER: "resend" })).toThrow(EmailError);
  });

  it("fillTemplate", () => {
    expect(fillTemplate("Ahoj {url} {x}", { url: "U" })).toBe("Ahoj U {x}");
  });
});
