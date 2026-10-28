-- Panáček bez cedule (požadavek vlastníka 2026-10-28): sign_color 'none'; bez cedule je slogan
-- nepovinný. Jen rozšíření checků – existující řádky platí dál, práva kompas_app se nemění
-- (ALTER TABLE … CONSTRAINT granty nepřepisuje).
ALTER TABLE "app"."demonstrator" DROP CONSTRAINT IF EXISTS "demonstrator_sign_color";--> statement-breakpoint
ALTER TABLE "app"."demonstrator" ADD CONSTRAINT "demonstrator_sign_color" CHECK ("app"."demonstrator"."sign_color" in ('white', 'blue', 'red', 'none'));--> statement-breakpoint
ALTER TABLE "app"."demonstrator" DROP CONSTRAINT IF EXISTS "demonstrator_slogan_present";--> statement-breakpoint
ALTER TABLE "app"."demonstrator" ADD CONSTRAINT "demonstrator_slogan_present" CHECK ("app"."demonstrator"."sign_color" = 'none' or "app"."demonstrator"."slogan_preset_id" is not null or "app"."demonstrator"."slogan_custom" is not null);
