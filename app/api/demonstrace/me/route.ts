import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { getOwnerSignatureId } from "@/lib/demo/owner";
import { findBySignature } from "@/lib/demo/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/demonstrace/me → { id, index, signatureId } | 404 – panáček vlastníka podle cookie
 * ok_owner („Najdi mě“, /v/[uuid]). `signatureId` navíc, aby /v/[uuid] poznala vlastní podpis.
 * Bez cookie 401.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (flags.staticDemo()) return demoError("not_found", 404);
  const owner = getOwnerSignatureId(req);
  if (!owner) return demoError("unauthorized", 401);
  try {
    const me = await findBySignature(getSql(), owner);
    if (!me) return demoError("not_found", 404, { signatureId: owner });
    return demoJson({ ...me, signatureId: owner });
  } catch (e) {
    return demoUnavailable(e, "me");
  }
}
