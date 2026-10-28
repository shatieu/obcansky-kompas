CREATE SEQUENCE "app"."demonstrator_position_seq" INCREMENT BY 1 MINVALUE 0 MAXVALUE 9223372036854775807 START WITH 0 CACHE 1;--> statement-breakpoint
CREATE TABLE "app"."demonstrator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature_id" uuid NOT NULL,
	"position_index" integer DEFAULT nextval('app.demonstrator_position_seq') NOT NULL,
	"seed" bigint NOT NULL,
	"pose" text NOT NULL,
	"sign_color" text NOT NULL,
	"slogan_preset_id" text,
	"slogan_custom" text,
	"slogan_status" text DEFAULT 'none' NOT NULL,
	"first_name" text,
	"name_status" text DEFAULT 'none' NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"hidden_at" timestamp with time zone,
	"report_count" integer DEFAULT 0 NOT NULL,
	"reroll_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"is_poc" boolean DEFAULT false NOT NULL,
	CONSTRAINT "demonstrator_signature_id_unique" UNIQUE("signature_id"),
	CONSTRAINT "demonstrator_position_index_unique" UNIQUE("position_index"),
	CONSTRAINT "demonstrator_seed_u32" CHECK ("app"."demonstrator"."seed" between 0 and 4294967295),
	CONSTRAINT "demonstrator_pose" CHECK ("app"."demonstrator"."pose" in ('drzi', 'mava', 'pochoduje', 'tleska', 'skace', 'pest')),
	CONSTRAINT "demonstrator_sign_color" CHECK ("app"."demonstrator"."sign_color" in ('white', 'blue', 'red')),
	CONSTRAINT "demonstrator_slogan_status" CHECK ("app"."demonstrator"."slogan_status" in ('none', 'pending', 'approved', 'rejected')),
	CONSTRAINT "demonstrator_name_status" CHECK ("app"."demonstrator"."name_status" in ('none', 'pending', 'approved', 'rejected')),
	CONSTRAINT "demonstrator_slogan_present" CHECK ("app"."demonstrator"."slogan_preset_id" is not null or "app"."demonstrator"."slogan_custom" is not null),
	CONSTRAINT "demonstrator_slogan_len" CHECK (char_length("app"."demonstrator"."slogan_custom") <= 40),
	CONSTRAINT "demonstrator_name_len" CHECK (char_length("app"."demonstrator"."first_name") <= 20),
	CONSTRAINT "demonstrator_reroll" CHECK ("app"."demonstrator"."reroll_count" between 0 and 20)
);
--> statement-breakpoint
ALTER TABLE "app"."demonstrator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."demonstrator_report" (
	"demonstrator_id" uuid NOT NULL,
	"ip_hmac" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demonstrator_report_demonstrator_id_ip_hmac_pk" PRIMARY KEY("demonstrator_id","ip_hmac")
);
--> statement-breakpoint
ALTER TABLE "app"."demonstrator_report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."moderation_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demonstrator_id" uuid NOT NULL,
	"field" text NOT NULL,
	"text_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"verdict" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_job_status" CHECK ("app"."moderation_job"."status" in ('pending', 'done', 'failed')),
	CONSTRAINT "moderation_job_field" CHECK ("app"."moderation_job"."field" in ('slogan', 'name'))
);
--> statement-breakpoint
ALTER TABLE "app"."moderation_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."moderation_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"demonstrator_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_log_actor" CHECK ("app"."moderation_log"."actor" in ('script', 'ai', 'reports', 'cli'))
);
--> statement-breakpoint
ALTER TABLE "app"."moderation_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."demonstrator" ADD CONSTRAINT "demonstrator_signature_id_signature_id_fk" FOREIGN KEY ("signature_id") REFERENCES "app"."signature"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."demonstrator_report" ADD CONSTRAINT "demonstrator_report_demonstrator_id_demonstrator_id_fk" FOREIGN KEY ("demonstrator_id") REFERENCES "app"."demonstrator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."moderation_job" ADD CONSTRAINT "moderation_job_demonstrator_id_demonstrator_id_fk" FOREIGN KEY ("demonstrator_id") REFERENCES "app"."demonstrator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."moderation_log" ADD CONSTRAINT "moderation_log_demonstrator_id_demonstrator_id_fk" FOREIGN KEY ("demonstrator_id") REFERENCES "app"."demonstrator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_job_due_idx" ON "app"."moderation_job" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "moderation_job_demonstrator_idx" ON "app"."moderation_job" USING btree ("demonstrator_id");--> statement-breakpoint
CREATE INDEX "moderation_log_demonstrator_idx" ON "app"."moderation_log" USING btree ("demonstrator_id");--> statement-breakpoint
-- Práva aplikační role (SPEC §14.1). Výchozí práva z 20261028060000_app_role.sql pokrývají
-- tabulky i sekvence vytvořené rolí postgres; explicitně pro jistotu (sekvence pořadí v davu,
-- bigserial moderation_log).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kompas_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON app.demonstrator, app.moderation_job, app.demonstrator_report, app.moderation_log TO kompas_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE app.demonstrator_position_seq, app.moderation_log_id_seq TO kompas_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON app.demonstrator, app.moderation_job, app.demonstrator_report, app.moderation_log FROM anon, authenticated';
  END IF;
END
$$;
