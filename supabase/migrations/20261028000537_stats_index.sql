DROP INDEX "app"."signature_stats_idx";--> statement-breakpoint
CREATE INDEX "signature_stats_idx" ON "app"."signature" USING btree ("is_seed","verification_level");