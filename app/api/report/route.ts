import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { clientIp, error, json, logEvent, readJson, siteUrl, unavailable, writeGate } from "@/lib/sign/http";
import { UUID_RE } from "@/lib/sign/input";
import { sendReport } from "@/lib/sign/mailer";
import { signTexts } from "@/lib/sign/texts";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().regex(UUID_RE),
  reason: z.string().trim().min(3).max(1000),
  contact: z.string().trim().max(200).nullish(),
});

/** POST /api/report { id, reason, contact?, turnstileToken } – „Nahlásit“ komentář (SPEC §7.3). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts();
  const body = await readJson(req);
  if (!body) return error("invalid", 400, t.sign.invalid);
  const ts = await verifyTurnstile(body.turnstileToken ?? body["cf-turnstile-response"]);
  if (!ts.ok) return error("turnstile", 400, t.sign.turnstile_failed);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return error("invalid", 400, t.sign.invalid);
  const { id, reason } = parsed.data;
  const contact = parsed.data.contact || null;
  try {
    const sql = getSql();
    const ipHit = await hit(sql, "reportPerIp", ipKey(clientIp(req)));
    if (!ipHit.allowed) return error("rate_limited", 429, t.sign.rate_limited);
    const [row] = await sql<{ id: string }[]>`select id from app.signature where id = ${id}`;
    if (!row) return error("not_found", 404, t.page.not_found_title);
  } catch (e) {
    return unavailable(e, "report");
  }
  const pageUrl = `${siteUrl(req)}/v/${id}`;
  after(() => sendReport({ signatureId: id, pageUrl, reason, contact }));
  logEvent("report");
  return json({ ok: true, message: t.page.report_sent }, 202);
}
