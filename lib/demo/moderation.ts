/**
 * Jediné místo, kde se lib/demo váže na moderaci (lib/moderation píše jiný modul):
 * scriptCheck (stupeň 1, čistá funkce), aiEnabled, enqueueModeration (fronta moderation_job
 * ve stejné transakci) a processModerationJobs (after() + cron). lib/moderation nemá index,
 * proto importy z jednotlivých souborů.
 */
export { scriptCheck } from "@/lib/moderation/script";
export { aiEnabled } from "@/lib/moderation/ai";
export { enqueueModeration, processModerationJobs } from "@/lib/moderation/queue";
