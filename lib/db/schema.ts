import { sql } from "drizzle-orm";
import {
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
      isSeed: boolean("is_seed").notNull().default(false),
      isPoc: boolean("is_poc").notNull().default(false),
      createdAt: createdAt(),
    },
    (t) => [
      index("signature_stats_idx").on(t.isSeed, t.verificationLevel),
      check("signature_comment_len", sql`char_length(${t.comment}) <= 500`),
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
