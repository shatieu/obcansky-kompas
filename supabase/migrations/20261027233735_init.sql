CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."verification_level" AS ENUM('unverified', 'email', 'sms', 'bankid');--> statement-breakpoint
CREATE TABLE "app"."email_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_job_status" CHECK ("app"."email_job"."status" in ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app"."email_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."email_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "email_token_purpose" CHECK ("app"."email_token"."purpose" in ('verify', 'edit'))
);
--> statement-breakpoint
ALTER TABLE "app"."email_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."event_counter" (
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_counter_kind_key_day_pk" PRIMARY KEY("kind","key","day")
);
--> statement-breakpoint
ALTER TABLE "app"."event_counter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact" text,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"token_hash" text,
	"submitted_at" timestamp with time zone,
	"answers" jsonb,
	"justifications" jsonb,
	"is_seed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organization_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "organization_type" CHECK ("app"."organization"."type" in ('strana', 'hnuti', 'iniciativa'))
);
--> statement-breakpoint
ALTER TABLE "app"."organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."rate_limit" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
ALTER TABLE "app"."rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."signature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answers" jsonb NOT NULL,
	"content_version" text NOT NULL,
	"region" text,
	"age_group" text,
	"municipality_size" text,
	"comment" text,
	"verification_level" "app"."verification_level" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"is_seed" boolean DEFAULT false NOT NULL,
	"is_poc" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_comment_len" CHECK (char_length("app"."signature"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "app"."signature" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."signature_version" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signature_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"content_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."signature_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app"."signer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signature_id" uuid NOT NULL,
	"name_enc" text NOT NULL,
	"show_name" boolean DEFAULT false NOT NULL,
	"email_enc" text NOT NULL,
	"email_hmac" text NOT NULL,
	"address_enc" text,
	"consent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "signer_signature_id_unique" UNIQUE("signature_id"),
	CONSTRAINT "signer_email_hmac_unique" UNIQUE("email_hmac")
);
--> statement-breakpoint
ALTER TABLE "app"."signer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."email_job" ADD CONSTRAINT "email_job_signer_id_signer_id_fk" FOREIGN KEY ("signer_id") REFERENCES "app"."signer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."email_token" ADD CONSTRAINT "email_token_signer_id_signer_id_fk" FOREIGN KEY ("signer_id") REFERENCES "app"."signer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signature_version" ADD CONSTRAINT "signature_version_signature_id_signature_id_fk" FOREIGN KEY ("signature_id") REFERENCES "app"."signature"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."signer" ADD CONSTRAINT "signer_signature_id_signature_id_fk" FOREIGN KEY ("signature_id") REFERENCES "app"."signature"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_job_due_idx" ON "app"."email_job" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "signature_stats_idx" ON "app"."signature" USING btree ("verification_level","is_seed") WHERE "app"."signature"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "signature_version_signature_idx" ON "app"."signature_version" USING btree ("signature_id");