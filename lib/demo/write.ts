import { after, type NextRequest, type NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { readJson } from "@/lib/sign/http";
import { revalidateDemo } from "./cache";
import { withInCrowd } from "./in-crowd";
import { demoError, demoJson, demoLog, demoUnavailable, demoWriteGate, writeLimited } from "./http";
import { demoInputSchema } from "./input";
import { aiEnabled, enqueueModeration, processModerationJobs, scriptCheck } from "./moderation";
import { demoConsentVersion } from "./consent";
import { getOwnerSignatureId } from "./owner";
import { editDemonstrator, joinDemonstration, type DemoWrite } from "./service";

/**
 * Společný průběh POST /api/demonstrace/join a PATCH /api/demonstrace/[id] (SPEC-demonstrace §3, §4):
 * brána zápisů → vlastník (cookie ok_owner) → zod → rate limit → skriptová moderace volných textů
 * (odmítnutí 400 {error:"moderation"} s hláškou ze SPEC) → zápis (AI: pending + fronta ve stejné
 * transakci, after() zpracuje) → zneplatnění dlaždice / osoby / meta.
 */
export async function handleDemoWrite(req: NextRequest, mode: { kind: "join" } | { kind: "edit"; id: string }): Promise<NextResponse> {
  const gate = demoWriteGate();
  if (gate) return gate;
  let owner: string | null;
  try {
    owner = await getOwnerSignatureId(req);
  } catch (e) {
    return demoUnavailable(e, `${mode.kind}:owner`);
  }
  if (!owner) return demoError("unauthorized", 401);
  const body = await readJson(req);
  if (!body) return demoError("invalid", 400);
  if (body.consent !== true) return demoError("consent", 400, { field: "consent" });
  const parsed = demoInputSchema.safeParse(body);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return demoError("invalid", 400, { field });
  }
  const v = parsed.data;

  let sql;
  try {
    sql = getSql();
    if (await writeLimited(sql, req, owner)) return demoError("rate_limited", 429);
  } catch (e) {
    return demoUnavailable(e, `${mode.kind}:limit`);
  }

  // Stupeň 1 (skript) – vždy, synchronně. Bez vysvětlení, aby nešlo filtr obcházet zkoušením.
  let sloganCustom: string | null = null;
  let firstName: string | null = null;
  if (v.sloganCustom) {
    const c = scriptCheck(v.sloganCustom, "slogan");
    if (!c.ok) return demoError("moderation", 400, { field: "sloganCustom" });
    sloganCustom = c.text;
  }
  if (v.firstName) {
    const c = scriptCheck(v.firstName, "name");
    if (!c.ok) return demoError("moderation", 400, { field: "firstName" });
    firstName = c.text;
  }

  const write: DemoWrite = {
    sloganPresetId: sloganCustom ? null : (v.sloganPresetId ?? null),
    sloganCustom,
    pose: v.pose,
    signColor: v.signColor,
    seed: v.seed,
    rerollCount: v.rerollCount,
    firstName,
  };
  const ai = aiEnabled();
  // Úprava = znovu potvrzený souhlas (body.consent === true výše) → obnoví consent_at i verzi.
  const opts = { ai, enqueue: ai ? enqueueModeration : undefined, poc: flags.pocMode(), consentVersion: demoConsentVersion() };

  try {
    if (mode.kind === "join") {
      const r = await joinDemonstration(sql, owner, write, opts);
      demoLog("join", { status: r.status });
      if (r.status === "not_eligible") return demoError("not_eligible", 403);
      if (r.status === "exists") return withInCrowd(demoError("exists", 409, { id: r.id, index: r.index }), true, req);
      await revalidateDemo({ index: r.index, id: r.id, meta: true });
      if (r.pending.length) after(() => processModerationJobs({ limit: 5 }));
      return withInCrowd(demoJson({ ok: true, id: r.id, index: r.index, pending: r.pending }, 201), true, req);
    }
    const r = await editDemonstrator(sql, mode.id, owner, write, opts);
    demoLog("edit", { status: r.status });
    if (r.status === "reroll_limit") return demoError("invalid", 400, { field: "seed" });
    if (r.status !== "ok") return demoError("not_found", 404);
    await revalidateDemo({ index: r.index, id: r.id });
    if (r.pending.length) after(() => processModerationJobs({ limit: 5 }));
    return withInCrowd(demoJson({ ok: true, id: r.id, index: r.index, pending: r.pending }), true, req);
  } catch (e) {
    return demoUnavailable(e, mode.kind);
  }
}
