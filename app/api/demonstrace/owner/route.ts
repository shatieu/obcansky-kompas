import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { demoError, demoJson, demoUnavailable, demoWriteGate } from "@/lib/demo/http";
import { bumpOwnerEpoch, clearOwnerCookie, getOwnerSignatureId, isSecureRequest, ownerEpoch, setOwnerCookie } from "@/lib/demo/owner";
import { signatureFromEditToken } from "@/lib/demo/service";
import { clientIp, readJson } from "@/lib/sign/http";
import { TOKEN_RE } from "@/lib/sign/input";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/owner { token, replace? } – platný odkaz pro úpravu z e-mailu (token se
 * NEspotřebuje) nastaví cookie ok_owner. Volá ho stránka /kompas/podpis/uprava/[token], aby se člověk
 * mohl připojit k demonstraci i na jiném zařízení, než kde podpis ověřil.
 * Prohlížeč s platnou cookie JINÉHO podpisu dostane 409 `owner_conflict` a cookie se nezmění,
 * dokud uživatel nepotvrdí nahrazení (`replace: true`) – sdílený počítač tak tiše nepřepne vlastníka.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = demoWriteGate();
  if (gate) return gate;
  const body = await readJson(req);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) return demoError("not_found", 404);
  try {
    const sql = getSql();
    const limited = await hit(sql, "demoOwnerPerIp", ipKey(clientIp(req)));
    if (!limited.allowed) return demoError("rate_limited", 429);
    const signatureId = await signatureFromEditToken(sql, token);
    if (!signatureId) return demoError("not_found", 404);
    const current = await getOwnerSignatureId(req, sql);
    if (current && current !== signatureId && body?.replace !== true) return demoError("owner_conflict", 409);
    return setOwnerCookie(demoJson({ ok: true, signatureId }), signatureId, isSecureRequest(req), await ownerEpoch(sql, signatureId));
  } catch (e) {
    return demoUnavailable(e, "owner");
  }
}

/**
 * DELETE /api/demonstrace/owner – odhlášení z online demonstrace: zvýší epochu vlastníka (všechny
 * cookie tohoto podpisu na všech zařízeních přestanou platit) a smaže cookie v tomto prohlížeči.
 */
export async function DELETE(req: NextRequest): Promise<Response> {
  const gate = demoWriteGate();
  if (gate) return gate;
  try {
    const sql = getSql();
    const current = await getOwnerSignatureId(req, sql);
    if (current) await bumpOwnerEpoch(sql, current);
    return clearOwnerCookie(demoJson({ ok: true }), isSecureRequest(req));
  } catch (e) {
    return demoUnavailable(e, "owner-logout");
  }
}
