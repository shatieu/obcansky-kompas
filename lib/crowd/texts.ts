import { z } from "zod";
import { readUiYaml } from "@/lib/content/ui-server";

/**
 * Texty davu (jen server): content/ui.yaml, serverová sekce `demonstrace_crowd` (do klientského
 * ui.json se nezapisuje). Do klientských komponent jdou jako props.
 */
const s = z.string().min(1);
export const crowdTextsSchema = z.object({
  meta_title: s,
  meta_description: s,
  kicker: s,
  count_one: s,
  count_few: s,
  count_many: s,
  join_button: s,
  edit_button: s,
  home_aria: s,
  list_button: s,
  find_me_button: s,
  minimap_button: s,
  start_button: s,
  end_button: s,
  zoom_in: s,
  zoom_out: s,
  canvas_label: s,
  canvas_help: s,
  minimap_label: s,
  loading: s,
  empty: s,
  error: s,
  retry_button: s,
  not_found: s,
  card: z.object({
    anonymous: s,
    rank: s,
    joined: s,
    share_button: s,
    report_button: s,
    copied: s,
    reported: s,
    report_error: s,
    report_verify: s,
    close: s,
    figure_label: s,
    figure_label_no_sign: s,
  }),
});
export type CrowdTexts = z.infer<typeof crowdTextsSchema>;

let cached: CrowdTexts | null = null;
export function crowdTexts(): CrowdTexts {
  if (cached) return cached;
  cached = crowdTextsSchema.parse(readUiYaml().demonstrace_crowd);
  return cached;
}
