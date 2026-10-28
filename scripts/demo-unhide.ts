/** `pnpm demo:unhide <id>` – ruční zásah do davu (SPEC-demonstrace §4.3), zápis do moderation_log (actor cli). */
import { runModerationCli } from "@/lib/demo/cli";

await runModerationCli("unhide");
