import type { NextRequest } from "next/server";
import { handleDemoWrite } from "@/lib/demo/write";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/join { sloganPresetId? | sloganCustom?, pose, signColor, seed, rerollCount,
 * firstName?, consent: true } → 201 { ok, id, index, pending } (SPEC-demonstrace §3).
 * Vyžaduje cookie ok_owner ověřeného podpisu; 409 { id, index } = už v davu (klient přejde na úpravu).
 */
export function POST(req: NextRequest): Promise<Response> {
  return handleDemoWrite(req, { kind: "join" });
}
