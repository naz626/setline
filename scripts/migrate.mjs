// Applies the SQL migrations in ./drizzle to the Postgres database in DATABASE_URL.
// Run with: npm run db:migrate
// With --if-configured it does nothing when DATABASE_URL is missing, so `npm run build` works locally
// and still creates or updates the tables on a host that has a database attached.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  if (process.argv.includes("--if-configured")) {
    console.log("No DATABASE_URL, skipping migrations.");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("Migrations applied.");
