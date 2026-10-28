import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Vše žije ve schématu `app` (ne `public`), SPEC §14.1. */
export const app = pgSchema("app");

export const verificationLevel = app.enum("verification_level", ["unverified", "email", "sms", "bankid"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const signature = app
  .table(
    "signature",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      answers: jsonb("answers").notNull(),
      contentVersion: text("content_version").notNull(),
      region: text("region"),
      ageGroup: text("age_group"),
      municipalitySize: text("municipality_size"),
      comment: text("comment"),
      verificationLevel: verificationLevel("verification_level").notNull().default("unverified"),
      verifiedAt: timestamp("verified_at", { withTimezone: true }),
      withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
      /** Epocha cookie vlastníka ok_owner (online demonstrace); odvolání a odhlášení ji zvýší. */
      ownerEpoch: integer("owner_epoch").notNull().default(0),
      /** Krátké číslo podpisu (XXXX-XXXX bez pomlčky), lib/sign/short-id.ts; migrace 20261028210000. */
      shortId: text("short_id").notNull().default(sql`app.random_short_id()`),
      isSeed: boolean("is_seed").notNull().default(false),
      isPoc: boolean("is_poc").notNull().default(false),
      createdAt: createdAt(),
    },
    (t) => [
      index("signature_stats_idx").on(t.isSeed, t.verificationLevel),
      uniqueIndex("signature_short_id_key").on(t.shortId),
      check("signature_comment_len", sql`char_length(${t.comment}) <= 500`),
      check("signature_short_id_format", sql`${t.shortId} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
    ],
  )
  .enableRLS();

export const signer = app
  .table(
    "signer",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      signatureId: uuid("signature_id")
        .notNull()
        .unique()
        .references(() => signature.id, { onDelete: "cascade" }),
      nameEnc: text("name_enc").notNull(),
      showName: boolean("show_name").notNull().default(false),
      emailEnc: text("email_enc").notNull(),
      emailHmac: text("email_hmac").notNull().unique(),
      addressEnc: text("address_enc"),
      consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    },
  )
  .enableRLS();

export const signatureVersion = app
  .table(
    "signature_version",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      signatureId: uuid("signature_id")
        .notNull()
        .references(() => signature.id, { onDelete: "cascade" }),
      answers: jsonb("answers").notNull(),
      contentVersion: text("content_version").notNull(),
      createdAt: createdAt(),
    },
    (t) => [index("signature_version_signature_idx").on(t.signatureId)],
  )
  .enableRLS();

export const emailToken = app
  .table(
    "email_token",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      signerId: uuid("signer_id")
        .notNull()
        .references(() => signer.id, { onDelete: "cascade" }),
      tokenHash: text("token_hash").notNull().unique(),
      purpose: text("purpose").notNull(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      usedAt: timestamp("used_at", { withTimezone: true }),
      createdAt: createdAt(),
    },
    (t) => [check("email_token_purpose", sql`${t.purpose} in ('verify', 'edit')`)],
  )
  .enableRLS();

export const emailJob = app
  .table(
    "email_job",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      signerId: uuid("signer_id")
        .notNull()
        .references(() => signer.id, { onDelete: "cascade" }),
      kind: text("kind").notNull(),
      status: text("status").notNull().default("pending"),
      attempts: integer("attempts").notNull().default(0),
      nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
      lastError: text("last_error"),
      createdAt: createdAt(),
    },
    (t) => [
      index("email_job_due_idx").on(t.status, t.nextAttemptAt),
      check("email_job_status", sql`${t.status} in ('pending', 'sent', 'failed')`),
    ],
  )
  .enableRLS();

export const organization = app
  .table(
    "organization",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      name: text("name").notNull(),
      type: text("type").notNull(),
      contact: text("contact"),
      invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
      tokenHash: text("token_hash").unique(),
      submittedAt: timestamp("submitted_at", { withTimezone: true }),
      answers: jsonb("answers"),
      justifications: jsonb("justifications"),
      isSeed: boolean("is_seed").notNull().default(false),
    },
    (t) => [check("organization_type", sql`${t.type} in ('strana', 'hnuti', 'iniciativa')`)],
  )
  .enableRLS();

export const eventCounter = app
  .table(
    "event_counter",
    {
      kind: text("kind").notNull(),
      key: text("key").notNull(),
      day: date("day").notNull(),
      count: integer("count").notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.kind, t.key, t.day] })],
  )
  .enableRLS();

export const rateLimit = app
  .table(
    "rate_limit",
    {
      bucket: text("bucket").notNull(),
      windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
      count: integer("count").notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
  )
  .enableRLS();

// ---------- Online demonstrace (SPEC-demonstrace §7) ----------

/** Pořadí v davu: přidělí se při připojení a nikdy se nemění (SPEC-demonstrace §6.1). */
export const demonstratorPositionSeq = app.sequence("demonstrator_position_seq", { startWith: 0, minValue: 0 });

const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const demonstrator = app
  .table(
    "demonstrator",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      signatureId: uuid("signature_id")
        .notNull()
        .unique()
        .references(() => signature.id, { onDelete: "cascade" }),
      positionIndex: integer("position_index")
        .notNull()
        .unique()
        .default(sql`nextval('app.demonstrator_position_seq')`),
      /** 32bit seed bez znaménka (0 … 2^32−1), proto bigint. */
      seed: bigint("seed", { mode: "number" }).notNull(),
      pose: text("pose").notNull(),
      signColor: text("sign_color").notNull(),
      sloganPresetId: text("slogan_preset_id"),
      sloganCustom: text("slogan_custom"),
      sloganStatus: text("slogan_status").notNull().default("none"),
      firstName: text("first_name"),
      nameStatus: text("name_status").notNull().default("none"),
      consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
      /** Verze (hash) textu souhlasu; obnoví se s consent_at při úpravě. */
      consentVersion: text("consent_version"),
      hiddenAt: timestamp("hidden_at", { withTimezone: true }),
      reportCount: integer("report_count").notNull().default(0),
      rerollCount: integer("reroll_count").notNull().default(0),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
      isSeed: boolean("is_seed").notNull().default(false),
      isPoc: boolean("is_poc").notNull().default(false),
    },
    (t) => [
      check("demonstrator_seed_u32", sql`${t.seed} between 0 and 4294967295`),
      check("demonstrator_pose", sql`${t.pose} in ('drzi', 'mava', 'pochoduje', 'tleska', 'skace', 'pest', 'klice')`),
      check("demonstrator_sign_color", sql`${t.signColor} in ('white', 'blue', 'red', 'none')`),
      check("demonstrator_slogan_status", sql`${t.sloganStatus} in ('none', 'pending', 'approved', 'rejected')`),
      check("demonstrator_name_status", sql`${t.nameStatus} in ('none', 'pending', 'approved', 'rejected')`),
      check("demonstrator_slogan_present", sql`${t.signColor} = 'none' or ${t.sloganPresetId} is not null or ${t.sloganCustom} is not null`),
      check("demonstrator_slogan_len", sql`char_length(${t.sloganCustom}) <= 40`),
      check("demonstrator_name_len", sql`char_length(${t.firstName}) <= 20`),
      check("demonstrator_reroll", sql`${t.rerollCount} between 0 and 20`),
    ],
  )
  .enableRLS();

export const moderationJob = app
  .table(
    "moderation_job",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      demonstratorId: uuid("demonstrator_id")
        .notNull()
        .references(() => demonstrator.id, { onDelete: "cascade" }),
      field: text("field").notNull(),
      /** sha256 hex kontrolovaného textu – verdikt se použije, jen když text mezitím nezměnil. */
      textHash: text("text_hash").notNull(),
      status: text("status").notNull().default("pending"),
      attempts: integer("attempts").notNull().default(0),
      nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
      lastError: text("last_error"),
      verdict: text("verdict"),
      category: text("category"),
      createdAt: createdAt(),
    },
    (t) => [
      index("moderation_job_due_idx").on(t.status, t.nextAttemptAt),
      index("moderation_job_demonstrator_idx").on(t.demonstratorId),
      check("moderation_job_status", sql`${t.status} in ('pending', 'done', 'failed')`),
      check("moderation_job_field", sql`${t.field} in ('slogan', 'name')`),
    ],
  )
  .enableRLS();

export const demonstratorReport = app
  .table(
    "demonstrator_report",
    {
      demonstratorId: uuid("demonstrator_id")
        .notNull()
        .references(() => demonstrator.id, { onDelete: "cascade" }),
      ipHmac: text("ip_hmac").notNull(),
      createdAt: createdAt(),
    },
    (t) => [primaryKey({ columns: [t.demonstratorId, t.ipHmac] })],
  )
  .enableRLS();

export const moderationLog = app
  .table(
    "moderation_log",
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      demonstratorId: uuid("demonstrator_id")
        .notNull()
        .references(() => demonstrator.id, { onDelete: "cascade" }),
      action: text("action").notNull(),
      actor: text("actor").notNull(),
      category: text("category"),
      createdAt: createdAt(),
    },
    (t) => [
      index("moderation_log_demonstrator_idx").on(t.demonstratorId),
      // Globální strop automatických skrytí po nahlášení (lib/demo/service.ts, AUTO_HIDE_PER_HOUR).
      index("moderation_log_actor_action_created_idx").on(t.actor, t.action, t.createdAt),
      check("moderation_log_actor", sql`${t.actor} in ('script', 'ai', 'reports', 'cli')`),
    ],
  )
  .enableRLS();
