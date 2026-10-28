import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { questionsFile } from "@/lib/content";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { parseSubmit } from "@/lib/org/input";
import { hitOrgLimit, submitAnswers } from "@/lib/org/service";
import { pagesTexts } from "@/lib/org/texts";
import { clientIp, readJson } from "@/lib/sign/http";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/org/submit (SPEC §12, §14.3): rate limit (IP) → zod + odpovědi proti otázkám →
 * jeden atomický UPDATE (odpovědi, odůvodnění, submitted_at, token_hash = null). Použitý
 * nebo neplatný token = 404. Do logu nejde token ani obsah odpovědí.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const tx = pagesTexts().org;
  if (flags.staticDemo()) return json({ ok: false, error: "static_demo", message: tx.error_static_demo }, 403);
  if (flags.readOnly()) return json({ ok: false, error: "read_only", message: tx.error_read_only }, 503);

  let sql;
  try {
    sql = getSql();
    if (!(await hitOrgLimit(sql, clientIp(req)))) {
      console.info("[org] rate_limited");
      return json({ ok: false, error: "rate_limited", message: tx.error_rate_limited }, 429);
    }
  } catch (e) {
    console.error(`[org] rate_limit failed code=${String((e as { code?: string })?.code ?? "unknown").slice(0, 40)}`);
    return json({ ok: false, error: "unavailable", message: tx.error_unavailable }, 503);
  }

  const body = await readJson(req);
  const parsed = parseSubmit(body, questionsFile);
  if (!parsed.ok) {
    if (parsed.reason === "token") return json({ ok: false, error: "not_found", message: tx.error_not_found }, 404);
    const message = parsed.reason === "confirm" ? tx.error_confirm : tx.error_invalid;
    return json({ ok: false, error: "invalid", field: parsed.reason, message }, 400);
  }

  try {
    const r = await submitAnswers(sql, parsed.token, parsed.answers, parsed.justifications);
    if (!r.ok) return json({ ok: false, error: "not_found", message: tx.error_not_found }, 404);
    console.info("[org] submitted");
    revalidatePath("/hnuti");
    return json({ ok: true });
  } catch (e) {
    console.error(`[org] submit failed code=${String((e as { code?: string })?.code ?? "unknown").slice(0, 40)}`);
    return json({ ok: false, error: "unavailable", message: tx.error_unavailable }, 503);
  }
}
