import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { getOwnerSignatureId } from "@/lib/demo/owner";
import { withInCrowd } from "@/lib/demo/in-crowd";
import { queryOwnDetail } from "@/lib/demo/tiles";

export const dynamic = "force-dynamic";

/**
 * GET /api/demonstrace/me/detail → { id, index, seed, pose, signColor, own } | 404 – vlastní panáček
 * podle cookie ok_owner včetně soukromé části (vlastní text a jeho stav, počet změn vzhledu).
 * Vždy `private, no-store`; veřejná karta GET /api/demonstrace/[id] soukromá data nikdy nevrací,
 * aby sdílená CDN odpověď nezávisela na cookie. Bez cookie 401.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (flags.staticDemo()) return demoError("not_found", 404);
  try {
    const owner = await getOwnerSignatureId(req);
    if (!owner) return demoError("unauthorized", 401);
    const me = await queryOwnDetail(getSql(), owner);
    if (!me) return withInCrowd(demoError("not_found", 404), false, req);
    return withInCrowd(demoJson(me), true, req);
  } catch (e) {
    return demoUnavailable(e, "me-detail");
  }
}
