import { describe, expect, it } from "vitest";
import { checkMigrations, findDestructive } from "../../../scripts/migration-guard.mjs";

describe("migration guard", () => {
  it("allows additive changes", () => {
    expect(findDestructive('ALTER TABLE "workspaces" ADD COLUMN "x" text;')).toEqual([]);
    expect(findDestructive('CREATE TABLE "things" ("id" uuid PRIMARY KEY);')).toEqual([]);
  });

  it("flags statements that can destroy data", () => {
    expect(findDestructive('ALTER TABLE "a" DROP COLUMN "b";')).toHaveLength(1);
    expect(findDestructive('DROP TABLE "a";')).toHaveLength(1);
    expect(findDestructive('TRUNCATE "a";')).toHaveLength(1);
    expect(findDestructive('delete from "a" where 1=1;')).toHaveLength(1);
    expect(findDestructive('ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE integer;')).toHaveLength(1);
    expect(findDestructive('ALTER TABLE "a" RENAME COLUMN "b" TO "c";')).toHaveLength(1);
  });

  it("ignores words inside comments", () => {
    expect(findDestructive('-- we never DROP TABLE here\nALTER TABLE "a" ADD COLUMN "b" text;')).toEqual([]);
  });

  it("allows an explicit, explained exception only", () => {
    expect(findDestructive('-- allow-destructive: removing the unused legacy table, backed up\nDROP TABLE "old";')).toEqual([]);
    expect(findDestructive('-- allow-destructive:\nDROP TABLE "old";')).toHaveLength(1);
  });

  it("passes for every migration in the repository", () => {
    expect(checkMigrations("drizzle")).toEqual([]);
  });
});
