// Applies the SQL migrations in ./drizzle to the Postgres database in DATABASE_URL.
// Run with: npm run db:migrate
// With --if-configured it does nothing when DATABASE_URL is missing, so `npm run build` works locally
// and still creates or updates the tables on a host that has a database attached.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Same lookup as src/lib/db/url.ts, but prefers a direct (unpooled) connection, which is safer for schema changes.
function findUrl(suffix) {
  if (process.env[suffix]) return process.env[suffix];
  const pattern = new RegExp(`^[A-Z0-9]+_${suffix}$`);
  const key = Object.keys(process.env).sort().find((name) => pattern.test(name) && process.env[name]);
  return key ? process.env[key] : undefined;
}
const url = findUrl("DATABASE_URL_UNPOOLED") ?? findUrl("DATABASE_URL");

if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("No database connection string found, skipping migrations.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("Migrations applied.");
