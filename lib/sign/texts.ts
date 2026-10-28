import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Texty podpisu (content/ui-sign.yaml). Čtou se jen na serveru a do klientských komponent
 * se předávají jako props. Až je jádro přenese do ui.yaml (klíč `sign`, `verify`, `page`,
 * `email`), stačí tady vrátit `ui` z `@/lib/content`.
 */
const str = z.string().min(1);
const group = <T extends readonly string[]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, str])) as { [K in T[number]]: typeof str });

export const signTextsSchema = z.object({
  sign: group([
    "meta_title", "title", "lead", "statement_title", "no_answers_title", "no_answers_lead", "compass_button",
    "edit_answers_button", "name_label", "email_label", "email_hint", "show_name_label", "show_name_hint",
    "address_label", "address_hint", "consent_label", "consent_hint", "privacy_link", "turnstile_label",
    "turnstile_wait", "submit_button", "sending", "sent_title", "sent_lead", "poc_label", "poc_lead",
    "poc_verify_button", "static_demo", "read_only", "unavailable", "rate_limited", "invalid", "disposable",
    "turnstile_failed", "edit_title", "edit_lead", "edit_save_title", "edit_save_lead", "edit_save_button",
    "edit_cancel_button", "edit_invalid_title", "edit_invalid_lead", "withdraw_title", "withdraw_lead",
    "withdraw_button", "withdraw_confirm_button", "withdrawn_title", "withdrawn_lead",
  ] as const).extend({ errors: group(["name", "email", "consent", "comment", "answers"] as const) }),
  verify: group([
    "meta_title", "working", "done_title", "done_lead", "continue_button", "used_title", "used_lead",
    "expired_title", "expired_lead", "invalid_title", "invalid_lead", "sign_again_button",
  ] as const),
  page: group([
    "meta_title", "kicker", "anonymous", "signed_by", "date_label", "level_label", "level_unverified",
    "level_email", "level_sms", "level_bankid", "answers_title", "not_answered", "skipped", "comment_title",
    "share_button", "share_copied", "compare_button", "law_button", "withdrawn_title", "withdrawn_lead",
    "not_found_title", "not_found_lead", "unavailable_title", "unavailable_lead", "retry_button", "static_demo",
    "poc_badge", "manage_title", "manage_lead", "manage_email_label", "manage_button", "manage_sent",
    "manage_poc_lead", "manage_poc_button", "report_open_button", "report_title", "report_lead",
    "report_reason_label", "report_contact_label", "report_button", "report_sent", "close_button",
  ] as const),
  email: group([
    "verify_subject", "verify_body", "edit_subject", "edit_body", "report_subject", "report_body",
  ] as const),
});

export type SignTexts = z.infer<typeof signTextsSchema>;

let cached: SignTexts | undefined;

export function signTexts(): SignTexts {
  if (!cached) {
    const file = path.join(process.cwd(), "content", "ui-sign.yaml");
    cached = signTextsSchema.parse(parse(readFileSync(file, "utf8")));
  }
  return cached;
}
