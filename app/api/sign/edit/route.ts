import type { NextRequest } from "next/server";
import { z } from "zod";
import { CONTENT_VERSION, questionsFile } from "@/lib/content";
import { getSql } from "@/lib/db/client";
import { revalidateSignature } from "@/lib/sign/cache";
import { error, json, logEvent, readJson, signaturePath, unavailable, writeGate } from "@/lib/sign/http";
import { clean, failedField, signInputSchema, TOKEN_RE, validateAnswers } from "@/lib/sign/input";
import { applyEdit } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";

export const dynamic = "force-dynamic";

/** POST /api/sign/edit { token, answers, showName, region, ageGroup, municipalitySize, comment } (SPEC §7.3). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts();
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!body || !TOKEN_RE.test(token)) return error("not_found", 404, t.sign.edit_invalid_lead);
  const schema = signInputSchema(questionsFile)
    .pick({ answers: true, showName: true, region: true, ageGroup: true, municipalitySize: true, comment: true })
    .extend({ token: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const field = failedField(parsed.error);
    return error("invalid", 400, field ? t.sign.errors[field] : t.sign.invalid, { field });
  }
  const answers = validateAnswers(parsed.data.answers, questionsFile);
  if (!answers.ok) return error("invalid", 400, t.sign.errors.answers, { field: "answers" });
  try {
    const r = await applyEdit(getSql(), token, {
      answers: answers.answers,
      contentVersion: CONTENT_VERSION,
      region: clean(parsed.data.region),
      ageGroup: clean(parsed.data.ageGroup),
      municipalitySize: clean(parsed.data.municipalitySize),
      comment: clean(parsed.data.comment),
      showName: parsed.data.showName,
    });
    logEvent("edit", { status: r.status });
    if (r.status === "expired") return error("expired", 410, t.sign.edit_invalid_lead);
    if (r.status !== "ok") return error("not_found", 404, t.sign.edit_invalid_lead);
    revalidateSignature(r.signatureId);
    return json({ ok: true, id: r.signatureId, url: signaturePath(r.signatureId) });
  } catch (e) {
    return unavailable(e, "edit");
  }
}
