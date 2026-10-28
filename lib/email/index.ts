import { createHash } from "node:crypto";

/**
 * E-mailový adaptér (SPEC §14.2): `EMAIL_PROVIDER=console | resend`. Resend se volá přes
 * fetch (bez SDK). Logy bez osobních údajů: adresát jen jako zkrácený hash.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Druh zprávy pro logy (verify, edit, report). */
  kind: string;
  replyTo?: string;
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<void>;
}

export class EmailError extends Error {
  constructor(
    message: string,
    /** Krátký kód bez osobních údajů – ukládá se do email_job.last_error. */
    public readonly code: string,
  ) {
    super(message);
  }
}

export const RESEND_URL = "https://api.resend.com/emails";

/** Adresát do logu: jen prvních 8 znaků sha256. */
export function redactRecipient(to: string): string {
  return `#${createHash("sha256").update(to.trim().toLowerCase()).digest("hex").slice(0, 8)}`;
}

export const consoleProvider: EmailProvider = {
  name: "console",
  async send(msg) {
    console.info(`[email:console] kind=${msg.kind} to=${redactRecipient(msg.to)} subject="${msg.subject}"`);
    // Tělo (odkazy s tokeny) jen při vývoji – v produkci by console provider neměl běžet.
    if (process.env.NODE_ENV !== "production") console.info(`[email:console] ${msg.text.replace(/\n+/g, " | ")}`);
  },
};

export function resendProvider(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      let res: Response;
      try {
        res = await (opts.fetchImpl ?? fetch)(RESEND_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: opts.from,
            to: [msg.to],
            subject: msg.subject,
            text: msg.text,
            ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new EmailError("Resend nedostupný", "network");
      }
      if (!res.ok) throw new EmailError(`Resend odpověděl ${res.status}`, `http_${res.status}`);
    },
  };
}

export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  const name = (env.EMAIL_PROVIDER || "console").toLowerCase();
  if (name === "resend") {
    if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) throw new EmailError("Chybí EMAIL_API_KEY nebo EMAIL_FROM", "not_configured");
    return resendProvider({ apiKey: env.EMAIL_API_KEY, from: env.EMAIL_FROM });
  }
  if (name === "console") return consoleProvider;
  throw new EmailError(`Neznámý EMAIL_PROVIDER`, "unknown_provider");
}

export async function sendEmail(msg: EmailMessage, provider: EmailProvider = getEmailProvider()): Promise<void> {
  await provider.send(msg);
}

/** Doplní {klíč} v šabloně e-mailu. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}
