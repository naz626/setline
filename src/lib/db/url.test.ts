import { describe, expect, it } from "vitest";
import { findDatabaseUrl } from "./url";

describe("findDatabaseUrl", () => {
  it("prefers DATABASE_URL", () => {
    expect(findDatabaseUrl({ DATABASE_URL: "a", STORAGE_DATABASE_URL: "b" })).toBe("a");
  });
  it("accepts a prefixed name and ignores the unpooled variant", () => {
    expect(findDatabaseUrl({ STORAGE_DATABASE_URL_UNPOOLED: "direct", STORAGE_DATABASE_URL: "pooled" })).toBe("pooled");
  });
  it("returns nothing when no connection string is set", () => {
    expect(findDatabaseUrl({ STORAGE_PGHOST: "host" })).toBeUndefined();
  });
});
