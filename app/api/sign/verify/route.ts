import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { revalidateSignature } from "@/lib/sign/cache";
import { error, json, logEvent, readJson, signaturePath, unavailable, writeGate } from "@/lib/sign/http";
import { TOKEN_RE } from "@/lib/sign/input";
import { verifySignature } from "@/lib/sign/service";
import { signTexts } from "@/lib/sign/texts";

export const dynamic = "force-dynamic";

/**
 * POST /api/sign/verify { token } (SPEC §7.2). Volá ji stránka /overeni/[token] z prohlížeče –
 * samotné GET odkazu (náhledy odkazů v poště) token nespotřebuje.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = writeGate();
  if (gate) return gate;
  const t = signTexts().verify;
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) return error("not_found", 404, t.invalid_lead);
  try {
    const r = await verifySignature(getSql(), token);
    logEvent("verify", { status: r.status });
    switch (r.status) {
      case "ok":
        revalidateSignature(r.signatureId);
        return json({ ok: true, id: r.signatureId, url: signaturePath(r.signatureId) });
      case "used":
        return error("used", 409, t.used_lead, { id: r.signatureId, url: signaturePath(r.signatureId) });
      case "expired":
        return error("expired", 410, t.expired_lead);
      default:
        return error("not_found", 404, t.invalid_lead);
    }
  } catch (e) {
    return unavailable(e, "verify");
  }
}
