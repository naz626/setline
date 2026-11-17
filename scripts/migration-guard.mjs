// Refuses migrations that can destroy customer data, so a deploy can never wipe what users have created.
// A migration that really must do this needs a line `-- allow-destructive: <reason>` and a review of the plan.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)\b/i, "drops a table, column or schema"],
  [/\bTRUNCATE\b/i, "truncates a table"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, "changes a column type"],
  [/\bRENAME\s+(TO|COLUMN)\b/i, "renames a table or column"],
];

/** Returns what is destructive in a migration's SQL, as short descriptions. Empty when it is safe or explicitly allowed. */
export function findDestructive(sql) {
  if (/--[ \t]*allow-destructive:[ \t]*\S/i.test(sql)) return [];
  const code = sql.replace(/--[^\n]*/g, "");
  return RULES.filter(([pattern]) => pattern.test(code)).map(([, reason]) => reason);
}

/** Checks every .sql file in a migrations folder. Returns a list of { file, problems }. */
export function checkMigrations(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, problems: findDestructive(readFileSync(join(dir, file), "utf8")) }))
    .filter((entry) => entry.problems.length > 0);
}
