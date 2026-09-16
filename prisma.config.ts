import { defineConfig } from "prisma/config";

/**
 * The local development database is the only silent default. In production a missing
 * DATABASE_URL is a deployment mistake, so migrations stop with a message that says what to set
 * instead of trying to reach a Postgres that is not there.
 */
function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (url) return url;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("DATABASE_URL is not set. Add it to the service's environment variables (on Railway: reference the Postgres service). See docs/runbooks/hosted-setup.md, step 4.");
  }
  return "postgresql://clover:clover_dev@127.0.0.1:5432/clover_dev";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: databaseUrl() },
});
