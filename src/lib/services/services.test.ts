import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { AuthError, consumeLoginToken, createLoginToken, getSessionUser } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { leadTimeProfiles, programs } from "@/lib/db/schema";
import { InputError } from "./errors";
import { createProfile, listProfiles, updateProfile } from "./leadTimes";
import { findMember } from "./member";
import type { Member } from "./member";
import { completeNextMilestone, createProgram, getProgramView, listProgramViews } from "./programs";
import { inviteMember } from "./team";
import { createWorkspace } from "./workspace";

let db: Db;

async function signIn(email: string) {
  const { token } = await createLoginToken(db, email);
  return consumeLoginToken(db, token);
}

async function memberFor(email: string): Promise<Member> {
  const { user } = await signIn(email);
  const member = await findMember(db, user);
  if (!member) throw new Error(`${email} has no workspace`);
  return member;
}

let admin: Member;

beforeAll(async () => {
  db = await createLocalDb("memory://");
  const { user } = await signIn("Admin@Brand.test");
  await createWorkspace(db, user, { name: "Brand", timezone: "America/New_York", withSamples: true });
  admin = (await findMember(db, user))!;
});

describe("sign-in links", () => {
  it("work once and store emails in lower case", async () => {
    const { token, email } = await createLoginToken(db, "  Person@Example.COM ");
    expect(email).toBe("person@example.com");
    const { sessionToken, user } = await consumeLoginToken(db, token);
    expect((await getSessionUser(db, sessionToken))?.id).toBe(user.id);
    await expect(consumeLoginToken(db, token)).rejects.toThrow(AuthError);
  });

  it("expire", async () => {
    const { token } = await createLoginToken(db, "late@example.com");
    const later = new Date(Date.now() + 16 * 60_000);
    await expect(consumeLoginToken(db, token, later)).rejects.toThrow(AuthError);
  });

  it("are limited per email and reject bad addresses", async () => {
    for (let i = 0; i < 5; i++) await createLoginToken(db, "many@example.com");
    await expect(createLoginToken(db, "many@example.com")).rejects.toThrow(/Too many/);
    await expect(createLoginToken(db, "not-an-email")).rejects.toThrow(AuthError);
  });

  it("reject unknown and expired sessions", async () => {
    expect(await getSessionUser(db, "nope")).toBeUndefined();
    const { sessionToken } = await signIn("soon@example.com");
    expect(await getSessionUser(db, sessionToken, new Date(Date.now() + 31 * 86_400_000))).toBeUndefined();
  });
});

describe("workspace setup", () => {
  it("makes the creator brand admin with sample programs in every state", async () => {
    expect(admin.membership.role).toBe("brandAdmin");
    const views = await listProgramViews(db, admin);
    expect(views.map((v) => v.health)).toEqual(["willMiss", "atRisk", "onTrack", "notStarted", "complete"]);
  });

  it("refuses a second workspace for the same person", async () => {
    await expect(createWorkspace(db, admin.user, { name: "Again", timezone: "UTC", withSamples: false })).rejects.toThrow(InputError);
  });
});

describe("roles and scoping", () => {
  it("lets invited people join with their role on first sign-in", async () => {
    await inviteMember(db, admin, { email: "designer@brand.test", role: "designer", vendorId: "" });
    const designer = await memberFor("designer@brand.test");
    expect(designer.membership.role).toBe("designer");
    expect(designer.workspace.id).toBe(admin.workspace.id);
  });

  it("stops roles without permission from changing things", async () => {
    const designer = await memberFor("designer@brand.test");
    const [profile] = await listProfiles(db, admin.workspace.id);
    await expect(updateProfile(db, designer, profile.id, { name: "x", steps: {} })).rejects.toThrow(ForbiddenError);
    await expect(createProgram(db, designer, { name: "X", retailer: "", displayType: "Endcap", storeCount: "", inStoreDate: "2027-06-01", vendorId: "" })).rejects.toThrow(ForbiddenError);
    await expect(inviteMember(db, designer, { email: "a@b.test", role: "designer", vendorId: "" })).rejects.toThrow(ForbiddenError);
  });

  it("shows vendor guests only their own vendor's programs", async () => {
    const views = await listProgramViews(db, admin);
    const harbor = views.find((v) => v.vendor?.name === "Harbor Display Co.")!.vendor!;
    await inviteMember(db, admin, { email: "rep@harbor.test", role: "vendorGuest", vendorId: harbor.id });
    const guest = await memberFor("rep@harbor.test");
    const visible = await listProgramViews(db, guest);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((v) => v.program.vendorId === harbor.id)).toBe(true);
    const other = views.find((v) => v.program.vendorId !== harbor.id)!;
    expect(await getProgramView(db, guest, other.program.id)).toBeUndefined();
  });

  it("requires a vendor for vendor guests", async () => {
    await expect(inviteMember(db, admin, { email: "x@y.test", role: "vendorGuest", vendorId: "" })).rejects.toThrow(InputError);
  });

  it("keeps workspaces apart", async () => {
    const { user } = await signIn("other@elsewhere.test");
    await createWorkspace(db, user, { name: "Elsewhere", timezone: "UTC", withSamples: false });
    const outsider = (await findMember(db, user))!;
    expect(await listProgramViews(db, outsider)).toEqual([]);
    const [mine] = await listProgramViews(db, admin);
    expect(await getProgramView(db, outsider, mine.program.id)).toBeUndefined();
    const [profile] = await listProfiles(db, admin.workspace.id);
    await expect(updateProfile(db, outsider, profile.id, { name: "x", steps: {} })).rejects.toThrow(InputError);
    await expect(completeNextMilestone(db, outsider, mine.program.id, "submit")).rejects.toThrow(InputError);
  });
});

describe("lead times and programs", () => {
  it("recalculates a program when a lead time changes", async () => {
    const id = await createProgram(db, admin, { name: "New Endcap", retailer: "Northline", displayType: "Endcap", storeCount: "50", inStoreDate: "2027-04-19", vendorId: "" });
    const before = (await getProgramView(db, admin, id))!;
    expect(before.planned.submit).toBe("2027-02-01");
    const [defaults] = await listProfiles(db, admin.workspace.id);
    const steps = Object.fromEntries(Object.entries(defaults.steps).map(([k, v]) => [k, { days: String(v!.days), unit: v!.unit }]));
    await updateProfile(db, admin, defaults.id, { name: "", steps: { ...steps, production: { days: "25", unit: "working" } } });
    const after = (await getProgramView(db, admin, id))!;
    expect(after.planned.submit).toBe("2027-01-25");
    expect(after.leadTimes.production.days).toBe(25);
  });

  it("keeps the workspace default complete and validates numbers", async () => {
    const [defaults] = await listProfiles(db, admin.workspace.id);
    await expect(updateProfile(db, admin, defaults.id, { name: "", steps: { quote: { days: "5", unit: "working" } } })).rejects.toThrow(/needs a number/);
    await expect(createProfile(db, admin, { name: "Air freight", vendorId: "", origin: "overseas", process: "", steps: { transitAndSet: { days: "-1", unit: "calendar" } } })).rejects.toThrow(InputError);
    await expect(createProfile(db, admin, { name: "No scope", vendorId: "", origin: "", process: "", steps: { quote: { days: "2", unit: "working" } } })).rejects.toThrow(/applies to/);
    await createProfile(db, admin, { name: "Air freight", vendorId: "", origin: "overseas", process: "", steps: { transitAndSet: { days: "10", unit: "calendar" } } });
    const saved = await db.select().from(leadTimeProfiles).where(eq(leadTimeProfiles.name, "Air freight"));
    expect(saved[0].steps).toEqual({ transitAndSet: { days: 10, unit: "calendar" } });
  });

  it("completes key dates in order only", async () => {
    const id = await createProgram(db, admin, { name: "Ordered", retailer: "", displayType: "Endcap", storeCount: "", inStoreDate: "2028-01-10", vendorId: "" });
    await expect(completeNextMilestone(db, admin, id, "quoteApproved")).rejects.toThrow(InputError);
    await completeNextMilestone(db, admin, id, "submit");
    const [row] = await db.select().from(programs).where(eq(programs.id, id));
    expect(Object.keys(row.completed)).toEqual(["submit"]);
    await expect(completeNextMilestone(db, admin, id, "quoteApproved")).rejects.toThrow(/Choose a vendor/);
  });

  it("rejects bad program input", async () => {
    const base = { name: "P", retailer: "", displayType: "Endcap", storeCount: "", inStoreDate: "2027-06-01", vendorId: "" };
    await expect(createProgram(db, admin, { ...base, inStoreDate: "2027-02-30" })).rejects.toThrow(/real date/);
    await expect(createProgram(db, admin, { ...base, name: " " })).rejects.toThrow(InputError);
    await expect(createProgram(db, admin, { ...base, vendorId: "not-a-vendor" })).rejects.toThrow(InputError);
    await expect(createProgram(db, admin, { ...base, storeCount: "2.5" })).rejects.toThrow(InputError);
  });
});
