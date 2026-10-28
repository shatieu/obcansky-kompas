import type postgres from "postgres";
import { sha256Hex } from "@/lib/crypto";
import { isGallerySeed } from "./gallery";
import { DEFAULT_PRESET_ID } from "./slogans";
import { MAX_REROLLS, POSES, REPORT_HIDE_THRESHOLD, SIGN_COLORS, U32_MAX, type ModerationField, type ModerationStatus, type Pose, type SignColor } from "./constants";

/**
 * Zápisy online demonstrace (SPEC-demonstrace §3, §4.3, §7). Každá operace = jedna transakce.
 * Volné texty sem chodí už po skriptové kontrole (scriptCheck v route handleru), tady se jen
 * rozhodne stav: s AI → `pending` + úloha do fronty ve stejné transakci, bez AI → `approved`.
 */

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type Db = Sql | Tx;

export type Enqueue = (tx: Tx, demonstratorId: string, field: ModerationField, text: string) => Promise<unknown>;

export interface DemoWrite {
  sloganPresetId: string | null;
  sloganCustom: string | null;
  pose: Pose;
  signColor: SignColor;
  seed: number;
  rerollCount: number;
  firstName: string | null;
}

export interface WriteOpts {
  /** AI moderace zapnutá (aiEnabled()). */
  ai: boolean;
  /** enqueueModeration z lib/moderation; povinné, když ai = true. */
  enqueue?: Enqueue;
  poc: boolean;
  /** Verze textu souhlasu (lib/demo/consent.ts); uloží se s consent_at při připojení i úpravě. */
  consentVersion?: string | null;
}

export type JoinOutcome =
  | { status: "ok"; id: string; index: number; pending: ModerationField[] }
  | { status: "exists"; id: string; index: number }
  | { status: "not_eligible" };

export type EditOutcome =
  | { status: "ok"; id: string; index: number; pending: ModerationField[] }
  | { status: "not_found" }
  | { status: "reroll_limit" };

/**
 * Počet změn vzhledu po úpravě (SPEC-demonstrace §3.4, max. 20, pak zůstane poslední). Server je
 * jediný zdroj pravdy a počet nikdy nesníží:
 *  - nezměněný seed → uložený počet;
 *  - seed z galerie (lib/demo/gallery) → změnu nespotřebuje: max(uložený, klientův ≤ 20) – klient
 *    mohl v téže úpravě i náhodně měnit;
 *  - jiný změněný seed (náhodná změna) → aspoň uložený + 1 (klient může poslat víc, když v jedné
 *    úpravě změnil víckrát), max. 20; při uložených 20 se změna odmítne (null).
 * Přesné „== uložený + 1“ by rozbilo víc změn v jedné úpravě (klient počítá každou).
 */
export function nextRerollCount(storedSeed: number, storedCount: number, newSeed: number, clientCount: number): number | null {
  const stored = Math.min(Math.max(0, storedCount), MAX_REROLLS);
  const client = Math.min(Math.max(0, clientCount), MAX_REROLLS);
  if (newSeed === storedSeed) return stored;
  if (isGallerySeed(newSeed)) return Math.max(stored, client);
  if (stored >= MAX_REROLLS) return null;
  return Math.min(MAX_REROLLS, Math.max(stored + 1, client));
}

/** Nový stav volného textu. Nezměněný text si stav ponechá (i `rejected` z demo:ban-text). */
export function nextStatus(
  newText: string | null,
  oldText: string | null,
  oldStatus: ModerationStatus,
  ai: boolean,
): { status: ModerationStatus; moderate: boolean } {
  if (!newText) return { status: "none", moderate: false };
  if (oldText === newText && oldStatus !== "none") return { status: oldStatus, moderate: false };
  return ai ? { status: "pending", moderate: true } : { status: "approved", moderate: false };
}

async function enqueueAll(
  tx: Tx,
  id: string,
  opts: WriteOpts,
  items: [ModerationField, string | null, boolean][],
): Promise<ModerationField[]> {
  const pending: ModerationField[] = [];
  for (const [field, text, moderate] of items) {
    if (!moderate || !text) continue;
    if (!opts.enqueue) throw new Error("AI moderace zapnutá, ale chybí enqueue");
    await opts.enqueue(tx, id, field, text);
    pending.push(field);
  }
  return pending;
}

export interface CreateOpts extends WriteOpts {
  /** Podpis je PoC (řádek panáčka dostane is_poc). */
  isPoc?: boolean;
  /** Volby panáčka. Bez nich náhodný panáček (`random`). */
  look?: DemoWrite;
  /**
   * Náhodné výchozí volby (připojení rovnou při podpisu): náhodný seed, póza i cedule (včetně
   * „bez cedule“), výchozí předvolba sloganu, bez jména. `rand` vrací [0, 1); výchozí crypto.
   */
  random?: { rand?: () => number; presetIds?: readonly string[]; defaultPresetId?: string };
}

/**
 * Vytvoří panáčka pro podpis v RÁMCI předané transakce. Kontrolu nároku (ověřený, neodvolaný
 * podpis, ještě bez panáčka) dělá volající – viz joinOnce. Znovupoužitelné i pro budoucí
 * „připojit se rovnou při podpisu“: `createDemonstrator(tx, signatureId, { ai, enqueue, poc, random: {} })`.
 * Volné texty v `look` už musí být po scriptCheck.
 */
export async function createDemonstrator(
  tx: Tx,
  signatureId: string,
  opts: CreateOpts,
): Promise<{ id: string; index: number; pending: ModerationField[]; look: DemoWrite }> {
  const d =
    opts.look ??
    randomDemoWrite(opts.random?.rand ?? cryptoRand, opts.random?.presetIds ?? [], opts.random?.defaultPresetId ?? DEFAULT_PRESET_ID);
  const slogan = nextStatus(d.sloganCustom, null, "none", opts.ai);
  const name = nextStatus(d.firstName, null, "none", opts.ai);
  const [row] = await tx<{ id: string; position_index: number }[]>`
    insert into app.demonstrator (
      signature_id, seed, pose, sign_color, slogan_preset_id, slogan_custom, slogan_status,
      first_name, name_status, consent_at, consent_version, reroll_count, is_poc)
    values (
      ${signatureId}, ${d.seed}, ${d.pose}, ${d.signColor}, ${d.sloganCustom ? null : d.sloganPresetId},
      ${d.sloganCustom}, ${slogan.status}, ${d.firstName}, ${name.status}, now(), ${opts.consentVersion ?? null},
      ${Math.min(Math.max(0, d.rerollCount), MAX_REROLLS)}, ${opts.poc || Boolean(opts.isPoc)})
    returning id, position_index`;
  const pending = await enqueueAll(tx, row!.id, opts, [
    ["slogan", d.sloganCustom, slogan.moderate],
    ["name", d.firstName, name.moderate],
  ]);
  return { id: row!.id, index: row!.position_index, pending, look: d };
}

function cryptoRand(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
}

/**
 * Náhodný panáček s výchozími volbami: náhodný seed, póza a cedule (i bez cedule), předvolba
 * sloganu (náhodná z `presetIds`, jinak `defaultPresetId`), bez jména. `rand` vrací [0, 1).
 */
export function randomDemoWrite(rand: () => number, presetIds: readonly string[], defaultPresetId: string): DemoWrite {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length) % xs.length]!;
  return {
    seed: Math.floor(rand() * (U32_MAX + 1)) >>> 0,
    pose: pick(POSES),
    signColor: pick(SIGN_COLORS),
    sloganPresetId: presetIds.length ? pick(presetIds) : defaultPresetId,
    sloganCustom: null,
    firstName: null,
    rerollCount: 0,
  };
}

async function joinOnce(sql: Sql, signatureId: string, d: DemoWrite, opts: WriteOpts): Promise<JoinOutcome> {
  return sql.begin(async (tx) => {
    const [sig] = await tx<{ verification_level: string; withdrawn_at: Date | null; is_poc: boolean }[]>`
      select verification_level, withdrawn_at, is_poc from app.signature where id = ${signatureId} for update`;
    if (!sig || sig.withdrawn_at || sig.verification_level === "unverified") return { status: "not_eligible" } as const;
    const [existing] = await tx<{ id: string; position_index: number }[]>`
      select id, position_index from app.demonstrator where signature_id = ${signatureId}`;
    if (existing) return { status: "exists", id: existing.id, index: existing.position_index } as const;
    const r = await createDemonstrator(tx, signatureId, { ...opts, isPoc: sig.is_poc, look: d });
    return { status: "ok", id: r.id, index: r.index, pending: r.pending } as const;
  });
}

/** Připojení k demonstraci: jeden panáček na ověřený, neodvolaný podpis. */
export async function joinDemonstration(sql: Sql, signatureId: string, d: DemoWrite, opts: WriteOpts): Promise<JoinOutcome> {
  try {
    return await joinOnce(sql, signatureId, d, opts);
  } catch (e) {
    // Souběh dvou připojení stejného podpisu: druhé narazí na unique signature_id.
    if ((e as { code?: string }).code === "23505") return joinOnce(sql, signatureId, d, opts);
    throw e;
  }
}

/** Úprava vlastního panáčka. Místo v davu (position_index) zůstává. */
export async function editDemonstrator(
  sql: Sql,
  id: string,
  ownerSignatureId: string,
  d: DemoWrite,
  opts: WriteOpts,
): Promise<EditOutcome> {
  return sql.begin(async (tx) => {
    const [cur] = await tx<
      {
        id: string;
        position_index: number;
        seed: number | string;
        reroll_count: number;
        slogan_custom: string | null;
        slogan_status: ModerationStatus;
        first_name: string | null;
        name_status: ModerationStatus;
      }[]
    >`
      select d.id, d.position_index, d.seed, d.reroll_count, d.slogan_custom, d.slogan_status, d.first_name, d.name_status
      from app.demonstrator d join app.signature s on s.id = d.signature_id
      where d.id = ${id} and d.signature_id = ${ownerSignatureId} and s.withdrawn_at is null
      for update of d`;
    if (!cur) return { status: "not_found" } as const;
    const rerollCount = nextRerollCount(Number(cur.seed), cur.reroll_count, d.seed, d.rerollCount);
    if (rerollCount === null) return { status: "reroll_limit" } as const;
    const slogan = nextStatus(d.sloganCustom, cur.slogan_custom, cur.slogan_status, opts.ai);
    const name = nextStatus(d.firstName, cur.first_name, cur.name_status, opts.ai);
    await tx`
      update app.demonstrator set
        seed = ${d.seed}, pose = ${d.pose}, sign_color = ${d.signColor},
        slogan_preset_id = ${d.sloganCustom ? null : d.sloganPresetId}, slogan_custom = ${d.sloganCustom},
        slogan_status = ${slogan.status}, first_name = ${d.firstName}, name_status = ${name.status},
        reroll_count = ${rerollCount}, updated_at = now(),
        consent_at = now(), consent_version = coalesce(${opts.consentVersion ?? null}, consent_version)
      where id = ${id}`;
    // Nevyřízené úlohy pro změněné nebo odebrané pole už nejsou potřeba.
    const stale: string[] = [];
    if (slogan.moderate || !d.sloganCustom) stale.push("slogan");
    if (name.moderate || !d.firstName) stale.push("name");
    if (stale.length) await tx`delete from app.moderation_job where demonstrator_id = ${id} and status = 'pending' and field in ${tx(stale)}`;
    const pending = await enqueueAll(tx, id, opts, [
      ["slogan", d.sloganCustom, slogan.moderate],
      ["name", d.firstName, name.moderate],
    ]);
    return { status: "ok", id, index: cur.position_index, pending } as const;
  });
}

/** Panáček vlastníka (pro „Najdi mě“ a /v/[uuid]). */
export async function findBySignature(sql: Db, signatureId: string): Promise<{ id: string; index: number } | null> {
  const [row] = await sql<{ id: string; position_index: number }[]>`
    select d.id, d.position_index from app.demonstrator d join app.signature s on s.id = d.signature_id
    where d.signature_id = ${signatureId} and s.withdrawn_at is null`;
  return row ? { id: row.id, index: row.position_index } : null;
}

/** Odvolání podpisu: smaže panáčka (s ním kaskádou fronta, nahlášení a log). Volá withdrawSignature. */
export async function deleteForSignature(sql: Db, signatureId: string): Promise<{ id: string; index: number } | null> {
  const [row] = await sql<{ id: string; position_index: number }[]>`
    delete from app.demonstrator where signature_id = ${signatureId} returning id, position_index`;
  return row ? { id: row.id, index: row.position_index } : null;
}

/** Platný (nespotřebovaný, neprošlý) odkaz pro úpravu → id podpisu. Token se nespotřebuje. */
export async function signatureFromEditToken(sql: Db, token: string): Promise<string | null> {
  const [row] = await sql<{ signature_id: string }[]>`
    select r.signature_id
    from app.email_token t
    join app.signer r on r.id = t.signer_id
    join app.signature s on s.id = r.signature_id
    where t.token_hash = ${sha256Hex(token)} and t.purpose = 'edit' and t.used_at is null
      and t.expires_at > now() and s.withdrawn_at is null`;
  return row?.signature_id ?? null;
}

// ---------- Nahlášení a ruční zásahy (§4.3) ----------

export type ReportOutcome =
  | { status: "ok"; index: number; hidden: boolean; newlyHidden: boolean; deferred: boolean }
  | { status: "duplicate"; index: number }
  | { status: "not_found" };

/**
 * Globální strop automatických skrytí po nahlášení za hodinu (bezpečnostní review): koordinovaný
 * útok z mnoha sítí nesmí hromadně „vymazat“ dav. Nad stropem se nahlášení zapíše, panáček
 * zůstane viditelný a čeká na ruční kontrolu (`pnpm demo:reported`, moderation_log `hide_deferred`).
 */
export const AUTO_HIDE_PER_HOUR = 20;

/**
 * Nahlášení: max. 1 na síť (HMAC IPv4 / IPv6 /64) a panáčka. Po REPORT_HIDE_THRESHOLD různých
 * sítích se vlastní text a jméno skryjí (hidden_at) do ruční kontroly a zásah se zapíše do
 * moderation_log (actor reports). Skrývá se jen to, co je co skrýt (vlastní text nebo jméno), a
 * nejvýš AUTO_HIDE_PER_HOUR za hodinu napříč davem; nad stropem `deferred` (log `hide_deferred`).
 */
export async function reportDemonstrator(sql: Sql, id: string, ipHmac: string, opts: { hideCap?: number } = {}): Promise<ReportOutcome> {
  const cap = opts.hideCap ?? AUTO_HIDE_PER_HOUR;
  return sql.begin(async (tx) => {
    const [d] = await tx<{ position_index: number; hidden_at: Date | null; has_text: boolean }[]>`
      select position_index, hidden_at, (slogan_custom is not null or first_name is not null) as has_text
      from app.demonstrator where id = ${id} for update`;
    if (!d) return { status: "not_found" } as const;
    const ins = await tx`
      insert into app.demonstrator_report (demonstrator_id, ip_hmac) values (${id}, ${ipHmac})
      on conflict do nothing`;
    if (ins.count === 0) return { status: "duplicate", index: d.position_index } as const;
    await tx`update app.demonstrator set report_count = report_count + 1 where id = ${id}`;
    const [c] = await tx<{ n: number }[]>`select count(*)::int as n from app.demonstrator_report where demonstrator_id = ${id}`;
    let newlyHidden = false;
    let deferred = false;
    if (!d.hidden_at && d.has_text && c!.n >= REPORT_HIDE_THRESHOLD) {
      // Strop je globální → serializace souběžných skrytí (zámek jen po dobu transakce).
      await tx`select pg_advisory_xact_lock(hashtext('demo-report-autohide'))`;
      const [h] = await tx<{ n: number }[]>`
        select count(*)::int as n from app.moderation_log
        where actor = 'reports' and action = 'hide' and created_at > now() - interval '1 hour'`;
      if (h!.n < cap) {
        await tx`update app.demonstrator set hidden_at = now(), updated_at = now() where id = ${id}`;
        await tx`insert into app.moderation_log (demonstrator_id, action, actor) values (${id}, 'hide', 'reports')`;
        newlyHidden = true;
      } else {
        // Jednou na panáčka: další nahlášení už nový záznam nepřidají.
        const [prev] = await tx`
          select 1 from app.moderation_log where demonstrator_id = ${id} and actor = 'reports' and action = 'hide_deferred'`;
        if (!prev) await tx`insert into app.moderation_log (demonstrator_id, action, actor) values (${id}, 'hide_deferred', 'reports')`;
        deferred = true;
      }
    }
    return { status: "ok", index: d.position_index, hidden: Boolean(d.hidden_at) || newlyHidden, newlyHidden, deferred } as const;
  });
}

export type ModAction = "hide" | "unhide" | "ban-text";

/** Ruční zásah z CLI (demo:hide / demo:unhide / demo:ban-text). Vrací index pro revalidaci, nebo null. */
export async function moderateDemonstrator(sql: Sql, id: string, action: ModAction): Promise<{ index: number } | null> {
  return sql.begin(async (tx) => {
    const [d] = await tx<{ position_index: number }[]>`select position_index from app.demonstrator where id = ${id} for update`;
    if (!d) return null;
    if (action === "hide") {
      await tx`update app.demonstrator set hidden_at = coalesce(hidden_at, now()), updated_at = now() where id = ${id}`;
    } else if (action === "unhide") {
      // Po ruční kontrole se nahlášení vynulují – ke skrytí jsou pak potřeba nová 3.
      await tx`update app.demonstrator set hidden_at = null, report_count = 0, updated_at = now() where id = ${id}`;
      await tx`delete from app.demonstrator_report where demonstrator_id = ${id}`;
    } else {
      await tx`
        update app.demonstrator set
          slogan_status = case when slogan_custom is not null then 'rejected' else slogan_status end,
          name_status = case when first_name is not null then 'rejected' else name_status end,
          updated_at = now()
        where id = ${id}`;
      await tx`delete from app.moderation_job where demonstrator_id = ${id} and status = 'pending'`;
    }
    await tx`insert into app.moderation_log (demonstrator_id, action, actor) values (${id}, ${action}, 'cli')`;
    return { index: d.position_index };
  });
}

export interface ReportedRow {
  id: string;
  index: number;
  reportCount: number;
  hidden: boolean;
  sloganCustom: string | null;
  sloganStatus: ModerationStatus;
  firstName: string | null;
  nameStatus: ModerationStatus;
  updatedAt: string;
}

/** Výpis pro `pnpm demo:reported`: skrytí a nahlášení, nejvíc nahlášení první. */
export async function listReported(sql: Sql, limit = 200): Promise<ReportedRow[]> {
  const rows = await sql<
    {
      id: string;
      position_index: number;
      report_count: number;
      hidden_at: Date | null;
      slogan_custom: string | null;
      slogan_status: ModerationStatus;
      first_name: string | null;
      name_status: ModerationStatus;
      updated_at: Date;
    }[]
  >`
    select id, position_index, report_count, hidden_at, slogan_custom, slogan_status, first_name, name_status, updated_at
    from app.demonstrator where report_count > 0 or hidden_at is not null
    order by (hidden_at is not null) desc, report_count desc, updated_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    index: r.position_index,
    reportCount: r.report_count,
    hidden: Boolean(r.hidden_at),
    sloganCustom: r.slogan_custom,
    sloganStatus: r.slogan_status,
    firstName: r.first_name,
    nameStatus: r.name_status,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** Úklid: nahlášení starší než `days` dní (IP HMAC max. 7 dní, SPEC §14.3). Skrytí zůstává. */
export async function pruneReports(sql: Sql, days = 7): Promise<number> {
  const r = await sql`delete from app.demonstrator_report where created_at < now() - make_interval(days => ${days})`;
  return r.count;
}
