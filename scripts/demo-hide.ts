/** `pnpm demo:hide <id> [--no-revalidate]` – ruční zásah do davu (SPEC-demonstrace §4.3), zápis do moderation_log (actor cli). Bez revalidace cache skončí nenulově. */
import { runModerationCli } from "@/lib/demo/cli";

await runModerationCli("hide");
