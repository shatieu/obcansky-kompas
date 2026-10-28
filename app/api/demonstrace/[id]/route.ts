import type { NextRequest } from "next/server";
import { CACHE_PERSON, personTag } from "@/lib/demo/constants";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { loadPerson } from "@/lib/demo/read";
import { handleDemoWrite } from "@/lib/demo/write";
import { UUID_RE } from "@/lib/sign/input";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/demonstrace/[id] → { id, index, seed, pose, signColor, slogan, name, joinedDay } – jen
 * veřejná data, pro všechny stejná (CDN s tagem demo-person:<id>, čištěný při každé změně).
 * Soukromá část pro vlastníka je zvlášť: GET /api/demonstrace/me/detail.
 */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return demoError("not_found", 404);
  try {
    const person = await loadPerson(id.toLowerCase());
    if (!person) return demoError("not_found", 404);
    return demoJson(person, 200, { "cache-control": CACHE_PERSON, "vercel-cache-tag": personTag(person.id) });
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
