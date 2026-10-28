import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Texty stránek /hnuti, /org, /metodika, /o-projektu, /soukromi (content/ui.yaml, sekce hnuti,
 * org, method, sources, about, privacy – do klientského ui.json se nezapisují).
 * Čtou se jen na serveru (i při buildu statických stránek); do klientských komponent jdou
 * jako props.
 */
const str = z.string().min(1);
const group = <T extends readonly string[]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, str])) as { [K in T[number]]: typeof str });

export const pagesTextsSchema = z.object({
  hnuti: group([
    "meta_title", "title", "lead", "type_strana", "type_hnuti", "type_iniciativa", "answered", "not_answered",
    "answers_open", "justification_label", "no_justification", "not_answered_question", "skipped_question",
    "empty_title", "empty_lead", "unavailable", "how_title", "how_body", "compass_button",
  ] as const),
  org: group([
    "meta_title", "kicker", "title", "lead", "lock_title", "lock_body", "question_label", "multi_lead",
    "skipped_lead", "forced_note", "disabled_label", "slider_label", "slider_value", "slider_untouched",
    "slider_clear_button", "justification_label", "justification_hint", "chars_left", "confirm_label",
    "submit_button", "sending", "done_title", "done_lead", "done_button", "error_invalid", "error_empty",
    "error_confirm", "error_not_found", "error_rate_limited", "error_unavailable", "error_read_only",
    "error_static_demo",
  ] as const),
  method: group([
    "meta_title", "kicker", "title", "lead", "compose_title", "compose_body", "branching_title", "branching_body",
    "branching_when", "branching_skip", "branching_only", "branching_disable", "library_title", "library_body",
    "library_version", "library_id", "library_ver", "library_text", "library_fragment", "library_group_frame",
    "library_group_nevim", "library_group_q1", "library_group_multi", "library_group_options", "verify_title",
    "verify_body", "deviation_title", "deviation_body", "counts", "human_title", "human_none", "human_some",
    "sources_button", "data_title", "data_body", "data_button", "repo_link", "repo_url",
    "demo_title", "demo_body", "demo_script_title", "demo_script_body", "demo_ai_title", "demo_ai_body",
    "demo_ai_on", "demo_ai_off", "demo_reports_title", "demo_reports_body",
  ] as const),
  sources: group([
    "meta_title", "kicker", "title", "lead", "generated", "group_explainer", "group_law", "group_facts",
    "explainer_shown", "explainer_pending", "claims_count", "source", "locator", "verdict", "round", "verifier",
    "checked_at", "human_reviewed", "yes", "no", "verdict_ano", "verdict_ne", "verdict_oprava", "verdict_missing",
    "verdict_changed", "correction", "none", "back_button",
  ] as const),
  about: group([
    "meta_title", "kicker", "title", "lead", "association_title", "association_body", "contact_title",
    "contact_body", "independence_title", "independence_body", "repo_title", "repo_body", "repo_button",
    "repo_url", "security_title", "security_body",
  ] as const),
  privacy: group([
    "meta_title", "kicker", "title", "lead", "controller_title", "controller_body", "data_title", "data_body",
    "purpose_title", "purpose_body", "basis_title", "basis_body", "processors_title", "processors_lead",
    "processor_vercel", "processor_supabase", "processor_email", "processor_turnstile", "processor_plausible",
    "retention_title", "retention_body", "logs_title", "logs_body", "rights_title", "rights_body", "how_title",
    "how_body", "browser_title", "browser_body", "demo_title", "demo_body", "demo_check_body",
    "demo_withdraw_body", "processor_moderation",
  ] as const),
});

export type PagesTexts = z.infer<typeof pagesTextsSchema>;
export type OrgFormTexts = PagesTexts["org"];

export const UI_PAGES_PATH = path.join(process.cwd(), "content", "ui.yaml");

let cache: PagesTexts | undefined;

export function loadPagesTexts(file = UI_PAGES_PATH): PagesTexts {
  const raw = (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
  const { hnuti, org, method, sources, about, privacy } = raw;
  return pagesTextsSchema.parse({ hnuti, org, method, sources, about, privacy });
}

export function pagesTexts(): PagesTexts {
  if (!cache || process.env.NODE_ENV === "development") cache = loadPagesTexts();
  return cache;
}
