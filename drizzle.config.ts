import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./supabase/migrations",
  schemaFilter: ["app"],
  migrations: { prefix: "supabase" },
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/postgres" },
});
