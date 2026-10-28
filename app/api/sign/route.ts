import { after, type NextRequest } from "next/server";
import { CONTENT_VERSION, questionsFile } from "@/lib/content";
import { getSql } from "@/lib/db/client";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { flags } from "@/lib/env";
import { hit, ipKey } from "@/lib/rate-limit";
import { emailHmac } from "@/lib/crypto";
import { revalidateSignature } from "@/lib/sign/cache";
import { clientIp, error, json, logEvent, readJson, siteUrl, unavailable, verifyUrl, writeGate } from "@/lib/sign/http";
import { clean, failedField, signInputSchema, validateAnswers } from "@/lib/sign/input";
import { deliverJob } from "@/lib/sign/mailer";
import { createOrReplaceSignature } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * POST /api/sign (SPEC §7.1, §7.2, §14.2, §14.3): Turnstile → rate limit (IP) → zod →
 * jednorázové domény → rate limit (e-mail) → jedna transakce (signature + signer + email_job)
 * → e-mail přes after(). Odpověď je stejná, ať e-mail existoval, nebo ne.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts().sign;

  const body = await readJson(req);
  if (!body) return error("invalid", 400, t.invalid);

  const ts = await verifyTurnstile(body.turnstileToken ?? body["cf-turnstile-response"]);
  if (!ts.ok) {
    logEvent("rejected", { reason: `turnstile_${ts.reason}` });
    return error("turnstile", 400, t.turnstile_failed);
  }

  let sql;
  try {
    sql = getSql();
    const ipHit = await hit(sql, "signPerIp", ipKey(clientIp(req)));
    if (!ipHit.allowed) {
      logEvent("rate_limited", { bucket: "ip" });
      return error("rate_limited", 429, t.rate_limited);
    }
  } catch (e) {
    return unavailable(e, "rate_limit");
  }

  const parsed = signInputSchema(questionsFile).safeParse(body);
  if (!parsed.success) {
    const field = failedField(parsed.error);
    logEvent("rejected", { reason: `invalid_${field ?? "other"}` });
    return error("invalid", 400, field ? t.errors[field] : t.invalid, { field });
  }
  const input = parsed.data;
  if (isDisposableEmail(input.email)) {
    logEvent("rejected", { reason: "disposable" });
    return error("disposable", 400, t.disposable, { field: "email" });
  }
  const answers = validateAnswers(input.answers, questionsFile);
  if (!answers.ok) {
    logEvent("rejected", { reason: "invalid_answers" });
    return error("invalid", 400, t.errors.answers, { field: "answers" });
  }

  const poc = flags.pocMode();
  const base = siteUrl(req);
  try {
    const mailHit = await hit(sql, "signPerEmail", emailHmac(input.email));
    if (!mailHit.allowed) {
      logEvent("rate_limited", { bucket: "email" });
      return error("rate_limited", 429, t.rate_limited);
    }
    const r = await createOrReplaceSignature(
      sql,
      {
        name: input.name,
        email: input.email,
        showName: input.showName,
        address: clean(input.address),
        answers: answers.answers,
        contentVersion: CONTENT_VERSION,
        region: clean(input.region),
        ageGroup: clean(input.ageGroup),
        municipalitySize: clean(input.municipalitySize),
        comment: clean(input.comment),
      },
      { poc },
    );
    logEvent("signed", { poc });
    revalidateSignature(r.signatureId);
    if (!poc) {
      after(() => deliverJob(sql, { id: r.jobId, signerId: r.signerId, kind: "verify", token: r.verifyToken, baseUrl: base }));
    }
    // Stejná odpověď pro nový i nahrazený podpis; UUID se nevrací (zjistil by se cizí podpis).
    return json(
      poc
        ? { ok: true, poc: true, message: t.poc_lead, verifyUrl: verifyUrl(base, r.verifyToken) }
        : { ok: true, poc: false, message: t.sent_lead },
      202,
    );
  } catch (e) {
    return unavailable(e, "sign");
  }
}
