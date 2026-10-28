import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { revalidateSignature } from "@/lib/sign/cache";
import { error, json, logEvent, readJson, signaturePath, unavailable, writeGate } from "@/lib/sign/http";
import { TOKEN_RE } from "@/lib/sign/input";
import { withdrawSignature } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";

export const dynamic = "force-dynamic";

/** POST /api/withdraw { token } – odvolání podpisu odkazem z e-mailu (SPEC §7.3). */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts().sign;
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) return error("not_found", 404, t.edit_invalid_lead);
  try {
    const r = await withdrawSignature(getSql(), token);
    logEvent("withdraw", { status: r.status });
    if (r.status === "expired") return error("expired", 410, t.edit_invalid_lead);
    if (r.status !== "ok") return error("not_found", 404, t.edit_invalid_lead);
    revalidateSignature(r.signatureId);
    return json({ ok: true, id: r.signatureId, url: signaturePath(r.signatureId), message: t.withdrawn_lead });
  } catch (e) {
    return unavailable(e, "withdraw");
  }
}
