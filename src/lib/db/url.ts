/**
 * Finds the Postgres connection string.
 * Uses DATABASE_URL when set. Otherwise accepts a prefixed name such as STORAGE_DATABASE_URL,
 * which is what Vercel creates when a database is attached with a custom prefix.
 * scripts/migrate.mjs repeats this lookup; keep the two in step.
 */
export function findDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const key = Object.keys(env).sort().find((name) => /^[A-Z0-9]+_DATABASE_URL$/.test(name) && env[name]);
  return key ? env[key] : undefined;
}
