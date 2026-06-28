import { execSync } from "node:child_process";

// Ensure the local D1 database has the schema before E2E runs. The migration is
// idempotent (CREATE TABLE IF NOT EXISTS) and writes to .wrangler/state, which
// is the same local state the dev server reads.
export default function globalSetup() {
  // Idempotent: ensures the photos table exists in the local D1. Tests use unique
  // data and relative assertions, so they don't require an empty table (which lets
  // them safely run against a reused dev server).
  execSync("npm run db:migrate:local", { stdio: "inherit" });
}
