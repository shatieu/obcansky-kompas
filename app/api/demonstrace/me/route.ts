import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { getOwnerSignatureId } from "@/lib/demo/owner";
import { withInCrowd } from "@/lib/demo/in-crowd";
import { findBySignature } from "@/lib/demo/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/demonstrace/me → { id, index, signatureId } | 404 – panáček vlastníka podle cookie
 * ok_owner („Najdi mě“, /v/[uuid]). `signatureId` navíc, aby /v/[uuid] poznala vlastní podpis.
 * Bez cookie 401. Odpověď nastaví/smaže nápovědu ok_in_crowd (lib/demo/in-crowd).
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (flags.staticDemo()) return demoError("not_found", 404);
  try {
    const owner = await getOwnerSignatureId(req);
    if (!owner) return withInCrowd(demoError("unauthorized", 401), false, req);
    const me = await findBySignature(getSql(), owner);
    if (!me) return withInCrowd(demoError("not_found", 404, { signatureId: owner }), false, req);
    return withInCrowd(demoJson({ ...me, signatureId: owner }), true, req);
  } catch (e) {
    return demoUnavailable(e, "me");
  }
}
