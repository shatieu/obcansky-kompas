-- Póza „Zvoní klíči“ (klice) – gesto listopadu 1989 (požadavek vlastníka 2026-10-28).
-- Jen rozšíření checku pózy; existující řádky platí dál, granty kompas_app se nemění.
ALTER TABLE "app"."demonstrator" DROP CONSTRAINT IF EXISTS "demonstrator_pose";--> statement-breakpoint
ALTER TABLE "app"."demonstrator" ADD CONSTRAINT "demonstrator_pose" CHECK ("app"."demonstrator"."pose" in ('drzi', 'mava', 'pochoduje', 'tleska', 'skace', 'pest', 'klice'));
