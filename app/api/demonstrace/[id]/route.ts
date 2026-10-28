import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { CACHE_PERSON } from "@/lib/demo/constants";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { getOwnerSignatureId } from "@/lib/demo/owner";
import { loadPerson } from "@/lib/demo/read";
import { queryOwn } from "@/lib/demo/tiles";
import { handleDemoWrite } from "@/lib/demo/write";
import { UUID_RE } from "@/lib/sign/input";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/demonstrace/[id] → { id, index, seed, pose, signColor, slogan, name, joinedDay, own? }.
 * `own` (vlastní text a jeho stav) jen pro vlastníka (cookie ok_owner) – taková odpověď je
 * `private, no-store`; veřejná odpověď je cachovaná na CDN (Vary: Cookie).
 */
export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return demoError("not_found", 404);
  try {
    const person = await loadPerson(id.toLowerCase());
    if (!person) return demoError("not_found", 404);
    const owner = flags.staticDemo() ? null : getOwnerSignatureId(req);
    if (owner) {
      const own = await queryOwn(getSql(), person.id, owner);
      if (own) return demoJson({ ...person, own });
    }
    return demoJson(person, 200, { "cache-control": CACHE_PERSON, vary: "Cookie" });
  } catch (e) {
    return demoUnavailable(e, "person");
  }
}

/** PATCH /api/demonstrace/[id] – úprava vlastního panáčka (stejná pole jako join), místo zůstává. */
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return demoError("not_found", 404);
  return handleDemoWrite(req, { kind: "edit", id: id.toLowerCase() });
}
