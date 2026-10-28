import type postgres from "postgres";
import type { BandThresholds } from "@/lib/compose/q1";
import { emptyQuestions, type Combo, type StatsFilters, type StatsResult } from "./aggregate";
import type { QuestionId } from "@/lib/compose/types";

/**
 * Statistiky jedním SQL dotazem (SPEC §14.2). Volá se z GET /api/stats (CDN cache 60 s)
 * a z ISR stránek. Seed se počítá jen s DEMO_MODE=1 (SPEC §14.3).
 */
export async function queryStats(
  sql: postgres.Sql,
  opts: { filters: StatsFilters; thresholds: BandThresholds | null; includeSeed: boolean; now?: Date },
): Promise<StatsResult> {
  const { region = null, ageGroup = null, municipalitySize = null } = opts.filters;
  const gov = opts.thresholds?.gov ?? null;
  const today = opts.thresholds?.today ?? null;

  const [row] = await sql<
    {
      verified: number;
      pending: number;
      counts: { q: string; o: string; n: number }[];
      totals: { q: string; n: number }[];
      q7sets: { k: string; n: number }[];
      combos: { a: string; b: string; c: string; n: number }[];
    }[]
  >`
    with base as (
      select answers, verification_level <> 'unverified' as verified
      from app.signature
      -- Odvolané podpisy zůstávají anonymně v agregacích (SPEC §7.3), proto bez withdrawn_at.
      where (${opts.includeSeed}::boolean or not is_seed)
        and (${region}::text is null or region = ${region}::text)
        and (${ageGroup}::text is null or age_group = ${ageGroup}::text)
        and (${municipalitySize}::text is null or municipality_size = ${municipalitySize}::text)
    ),
    v as (select answers from base where verified),
    kv as (select q.key as qid, q.value from v cross join lateral jsonb_each(v.answers) as q),
    opts as (
      select qid, e as opt from kv cross join lateral jsonb_array_elements_text(kv.value) as e
      where jsonb_typeof(kv.value) = 'array'
      union all
      select qid,
        case
          when jsonb_typeof(value) = 'number' then
            case
              when qid <> 'q1' or ${gov}::numeric is null then null
              when abs((value #>> '{}')::numeric - ${gov}::numeric) < 0.05 then 'gov'
              when abs((value #>> '{}')::numeric - ${today}::numeric) < 0.05 then 'today'
              when (value #>> '{}')::numeric < ${gov}::numeric then 'below-gov'
              when (value #>> '{}')::numeric < ${today}::numeric then 'between'
              else 'above-today'
            end
          else value #>> '{}'
        end
      from kv where jsonb_typeof(kv.value) <> 'array'
    ),
    counts as (select qid, opt, count(*)::int as n from opts where opt is not null group by qid, opt),
    totals as (select qid, count(*)::int as n from kv group by qid),
    q7sets as (
      select (select string_agg(x, '+' order by x collate "C") from jsonb_array_elements_text(answers -> 'q7') as x) as k,
             count(*)::int as n
      from v where jsonb_typeof(answers -> 'q7') = 'array'
      group by 1
    ),
    combos as (
      select * from (
        select answers ->> 'q2' as a, answers ->> 'q3' as b, answers ->> 'q4' as c, count(*)::int as n
        from v
        where jsonb_typeof(answers -> 'q2') = 'string' and jsonb_typeof(answers -> 'q3') = 'string'
          and jsonb_typeof(answers -> 'q4') = 'string'
        group by 1, 2, 3
      ) g
      order by n desc, a collate "C", b collate "C", c collate "C"
      limit 10
    )
    select
      (select count(*)::int from base where verified) as verified,
      (select count(*)::int from base where not verified) as pending,
      (select coalesce(json_agg(json_build_object('q', qid, 'o', opt, 'n', n)), '[]'::json) from counts) as counts,
      (select coalesce(json_agg(json_build_object('q', qid, 'n', n)), '[]'::json) from totals) as totals,
      (select coalesce(json_agg(json_build_object('k', k, 'n', n)), '[]'::json) from q7sets) as q7sets,
      (select coalesce(json_agg(json_build_object('a', a, 'b', b, 'c', c, 'n', n) order by n desc, a collate "C", b collate "C", c collate "C"), '[]'::json) from combos) as combos
  `;

  const questions = emptyQuestions();
  for (const t of row!.totals) if (t.q in questions) questions[t.q as QuestionId].total = t.n;
  for (const c of row!.counts) if (c.q in questions) questions[c.q as QuestionId].counts[c.o] = c.n;
  const q7Sets: Record<string, number> = {};
  for (const s of row!.q7sets) if (s.k) q7Sets[s.k] = s.n;
  const topCombos: Combo[] = row!.combos.map((c) => ({ options: [c.a, c.b, c.c], count: c.n }));

  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    demo: opts.includeSeed,
    source: "db",
    filters: opts.filters,
    verified: row!.verified,
    pending: row!.pending,
    questions,
    q7Sets,
    topCombos,
  };
}
