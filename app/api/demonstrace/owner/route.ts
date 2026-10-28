import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { demoError, demoJson, demoUnavailable, demoWriteGate } from "@/lib/demo/http";
import { isSecureRequest, setOwnerCookie } from "@/lib/demo/owner";
import { signatureFromEditToken } from "@/lib/demo/service";
import { clientIp, readJson } from "@/lib/sign/http";
import { TOKEN_RE } from "@/lib/sign/input";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/owner { token } – platný odkaz pro úpravu z e-mailu (token se NEspotřebuje)
 * nastaví cookie ok_owner. Volá ho stránka /kompas/podpis/uprava/[token], aby se člověk mohl
 * připojit k demonstraci i na jiném zařízení, než kde podpis ověřil.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = demoWriteGate();
  if (gate) return gate;
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) return demoError("not_found", 404);
  try {
    const sql = getSql();
    const limited = await hit(sql, "demoWritePerIp", ipKey(clientIp(req)));
    if (!limited.allowed) return demoError("rate_limited", 429);
    const signatureId = await signatureFromEditToken(sql, token);
    if (!signatureId) return demoError("not_found", 404);
    return setOwnerCookie(demoJson({ ok: true, signatureId }), signatureId, isSecureRequest(req));
  } catch (e) {
    return demoUnavailable(e, "owner");
  }
}
