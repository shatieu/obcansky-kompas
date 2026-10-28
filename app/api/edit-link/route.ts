import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { emailHmac, randomToken } from "@/lib/crypto";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { hit, ipKey } from "@/lib/rate-limit";
import { clientIp, editUrl, error, json, logEvent, readJson, siteUrl, unavailable, writeGate } from "@/lib/sign/http";
import { deliverJob } from "@/lib/sign/mailer";
import { requestEditLink } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ email: z.string().trim().max(254).pipe(z.email()) });

/**
 * POST /api/edit-link { email, turnstileToken } – „pošlete mi odkaz pro úpravu“ (SPEC §7.3).
 * Limit 3/h na e-mail (§14.3). Odpověď je stejná pro existující i neexistující e-mail;
 * v POC se odkaz ukáže na obrazovce – pro neexistující e-mail s neplatným (nikde neuloženým) tokenem.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts();
  const body = await readJson(req);
  if (!body) return error("invalid", 400, t.sign.invalid);
  const ts = await verifyTurnstile(body.turnstileToken ?? body["cf-turnstile-response"]);
  if (!ts.ok) return error("turnstile", 400, t.sign.turnstile_failed);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return error("invalid", 400, t.sign.errors.email, { field: "email" });
  const { email } = parsed.data;

  const poc = flags.pocMode();
  const base = siteUrl(req);
  try {
    const sql = getSql();
    const ipHit = await hit(sql, "editLinkPerIp", ipKey(clientIp(req)));
    const mailHit = await hit(sql, "editLinkPerEmail", emailHmac(email));
    if (!ipHit.allowed || !mailHit.allowed) {
      logEvent("edit_link_rate_limited");
      return error("rate_limited", 429, t.sign.rate_limited);
    }
    const r = await requestEditLink(sql, email, { poc });
    logEvent("edit_link", { poc });
    if (r && !poc) {
      after(() => deliverJob(sql, { id: r.jobId, signerId: r.signerId, kind: "edit", token: r.editToken, baseUrl: base }));
    }
    return json(
      poc
        ? { ok: true, poc: true, message: t.page.manage_poc_lead, editUrl: editUrl(base, r ? r.editToken : randomToken()) }
        : { ok: true, poc: false, message: t.page.manage_sent },
      202,
    );
  } catch (e) {
    return unavailable(e, "edit_link");
  }
}
