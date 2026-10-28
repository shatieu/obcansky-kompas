import type { NextRequest } from "next/server";
import { z } from "zod";
import slogansJson from "@/content/generated/slogans.json";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { NO_SLOGAN, VARIANTS } from "@/lib/photo/constants";
import { ipKey, windowStart } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/event – anonymní počítadla (SPEC §14.1 `event_counter`): stažený rámeček,
 * připravený dopis, sdílení. Žádné osobní údaje, žádná fotka, žádné cookies.
 * Ukládá se jen (kind, key, den) → count. Rate limit podle HMAC IP s denní solí.
 *
 * Tělo:
 *   { kind: "frame_downloaded", variant, slogan }  → key = "variant:slogan"
 *   { kind: "letter_prepared" | "share", key }      → key = krátký identifikátor [a-z0-9:_-]
 */

const sloganIds: [string, ...string[]] = [NO_SLOGAN, ...(slogansJson as { slogans: { id: string }[] }).slogans.map((s) => s.id)];

const Key = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,63}$/);

const EventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("frame_downloaded"), variant: z.enum(VARIANTS), slogan: z.enum(sloganIds) }),
  z.object({ kind: z.literal("letter_prepared"), key: Key }),
  z.object({ kind: z.literal("share"), key: Key }),
]);

/** Max. událostí na IP za hodinu – stačí na běžné použití, zastaví nafukování čísel. */
const EVENTS_PER_IP_PER_HOUR = 60;
const HOUR = 3600;

const noStore = { "cache-control": "no-store" };
const empty = (status: number) => new Response(null, { status, headers: noStore });

/** Den v české časové zóně (YYYY-MM-DD). */
function pragueDay(now: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(now);
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 1024) return empty(413);
    body = JSON.parse(text);
  } catch {
    return empty(400);
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) return empty(400);
  const ev = parsed.data;
  const key = ev.kind === "frame_downloaded" ? `${ev.variant}:${ev.slogan}` : ev.key;

  // Bez DB (virtuální nasazení) nebo v režimu jen pro čtení se nic nepočítá – klient to neřeší.
  if (!hasDatabase() || flags.readOnly() || flags.staticDemo()) return empty(202);

  try {
    const sql = getSql();
    const now = new Date();
    const bucket = `eventPerIp:${ipKey(clientIp(req), now)}`;
    const [hit] = await sql<{ count: number }[]>`
      insert into app.rate_limit (bucket, window_start, count)
      values (${bucket}, ${windowStart(now, HOUR).toISOString()}, 1)
      on conflict (bucket, window_start) do update set count = app.rate_limit.count + 1
      returning count`;
    if (Number(hit?.count ?? 1) > EVENTS_PER_IP_PER_HOUR) return empty(429);
    await sql`
      insert into app.event_counter (kind, key, day, count)
      values (${ev.kind}, ${key}, ${pragueDay(now)}, 1)
      on conflict (kind, key, day) do update set count = app.event_counter.count + 1`;
    return empty(204);
  } catch {
    // Počítadlo nesmí rozbít stažení fotky ani nic jiného.
    return empty(503);
  }
}
