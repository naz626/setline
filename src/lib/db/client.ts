import { mkdir } from "node:fs/promises";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { findDatabaseUrl } from "./url";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __setlineDb?: Promise<Db> };

/**
 * Returns the database.
 * With a database connection string set (see findDatabaseUrl) it connects to that Postgres. Without it, development uses an embedded Postgres (PGlite)
 * stored in .data/, with migrations applied on start, so the app runs with no database setup.
 */
export function getDb(): Promise<Db> {
  return (globalForDb.__setlineDb ??= createDb());
}

async function createDb(): Promise<Db> {
  const url = findDatabaseUrl();
  if (url) {
    const { Pool } = await import("pg");
    return drizzlePg(new Pool({ connectionString: url }), { schema });
  }
  if (process.env.NODE_ENV === "production" && !process.env.SETLINE_ALLOW_LOCAL_DB) {
    throw new Error("DATABASE_URL is not set. Point it at your Postgres database.");
  }
  const dir = process.env.SETLINE_LOCAL_DB_DIR ?? ".data/pglite";
  if (!dir.startsWith("memory://")) await mkdir(dir, { recursive: true });
  return createLocalDb(dir);
}

/** Embedded Postgres for development and tests. Pass "memory://" for a throwaway database. */
export async function createLocalDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}
