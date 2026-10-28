/**
 * Jediné místo, kde se lib/demo váže na moderaci (lib/moderation píše jiný modul):
 * scriptCheck (stupeň 1, čistá funkce), aiEnabled, enqueueModeration (fronta moderation_job
 * ve stejné transakci) a processModerationJobs (after() + cron). lib/moderation nemá index,
 * proto importy z jednotlivých souborů.
 */
import { aiEnabled } from "@/lib/moderation/ai";
import { scriptCheck as rawScriptCheck, type ModerationField, type ScriptResult } from "@/lib/moderation/script";

export { aiEnabled };
export { enqueueModeration, processModerationJobs } from "@/lib/moderation/queue";

/**
 * Serverová skriptová kontrola: text s písmeny mimo latinku/cyrilici/řečtinu s AI projde do
 * stupně 2 (stejně skončí `pending`), bez AI se odmítne (SPEC-demonstrace §4.1, §4.2).
 */
export function scriptCheck(text: string, field: ModerationField): ScriptResult {
  return rawScriptCheck(text, field, { ai: aiEnabled() });
}
