import { z } from "zod";
import { POSES, SIGN_COLORS } from "@/lib/demo/constants";
import { readUiYaml } from "@/lib/content/ui-server";

/**
 * Texty online demonstrace (content/ui.yaml, sekce `demonstrace` – jen server, do klientského
 * ui.json se nezapisuje, aby nerostl JS /kompas). Do klientských komponent jdou jako props.
 */
const str = z.string().min(1);
const group = <T extends readonly string[]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, str])) as { [K in T[number]]: typeof str });

export const demoTextsSchema = group([
  "stance_join_label", "stance_count_one", "stance_count_few", "stance_count_many", "stance_count_zero",
  "page_title", "page_invite_lead", "page_join_button", "page_mine_label", "page_edit_button",
] as const).extend({
  join: group([
    "meta_title", "kicker", "edit_kicker", "nav_aria", "nav_item", "nav_state_done", "nav_state_current",
    "nav_state_todo", "progress_label", "step_slogan", "step_pose", "step_color", "step_look", "step_name",
    "step_consent", "preview_label", "slogan_title", "slogan_lead", "slogan_custom_option", "slogan_custom_label",
    "slogan_custom_hint", "slogan_counter", "slogan_empty", "moderation", "pose_title", "pose_lead", "color_title",
    "color_lead", "look_title", "look_lead", "reroll_button", "reroll_left", "reroll_done", "name_title",
    "name_lead", "name_anonymous", "name_show", "name_label", "name_hint", "name_empty", "consent_title",
    "consent_lead", "consent_label", "consent_caption", "consent_error", "summary_slogan", "summary_name",
    "summary_anonymous", "next_button", "submit_button", "save_button", "sending", "joining_title",
    "joining_text", "edit_saved", "status_pending", "status_rejected", "status_pending_hint",
    "status_rejected_hint", "gate_title", "gate_lead", "gate_button", "gate_signed", "static_demo", "read_only",
    "error_generic", "error_rate_limited", "error_unauthorized", "view_crowd_button",
  ] as const).extend({ poses: group(POSES), colors: group(SIGN_COLORS) }),
  list: group([
    "meta_title", "meta_description", "kicker", "title", "lead", "anonymous", "rank", "joined", "page_label",
    "pagination_aria", "prev_button", "next_button", "crowd_button", "join_button", "empty", "unavailable",
  ] as const),
});

export type DemoTexts = z.infer<typeof demoTextsSchema>;
export type JoinTexts = DemoTexts["join"];
export type ListTexts = DemoTexts["list"];

let cache: DemoTexts | null = null;

export function demoTexts(): DemoTexts {
  if (cache && process.env.NODE_ENV !== "development") return cache;
  cache = demoTextsSchema.parse(readUiYaml().demonstrace);
  return cache;
}
