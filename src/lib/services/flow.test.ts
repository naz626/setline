import { beforeAll, describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { addDays } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { listActivity } from "./activity";
import { InputError } from "./errors";
import { addProgramFile, listProgramFiles, removeProgramFile } from "./files";
import { findMember } from "./member";
import type { Member } from "./member";
import { buildNotice } from "./notices";
import { completeNextMilestone, createProgram, findVisibleProgram, getProgramView, listProgramViews } from "./programs";
import { decideProof, submitProof } from "./proofs";
import { inviteMember } from "./team";
import { createVendor, setVendorStatus } from "./vendors";
import { createWorkspace } from "./workspace";

let db: Db;
let admin: Member;
let reviewer: Member;
let rep: Member;
let vendorId: string;
let today: string;

async function memberFor(email: string): Promise<Member> {
  const { token } = await createLoginToken(db, email);
  const { user } = await consumeLoginToken(db, token);
  return (await findMember(db, user))!;
}

const base = { retailer: "Northline", displayType: "Endcap", storeCount: "" };

beforeAll(async () => {
  db = await createLocalDb("memory://");
  const { token } = await createLoginToken(db, "admin@brand.test");
  const { user } = await consumeLoginToken(db, token);
  await createWorkspace(db, user, { name: "Brand", timezone: "America/New_York", withSamples: false });
  admin = (await findMember(db, user))!;
  today = todayInZone("America/New_York");
  vendorId = await createVendor(db, admin, { name: "Acme Displays", makes: "", origin: "domestic", process: "corrugate" });
  await inviteMember(db, admin, { email: "reviewer@brand.test", role: "reviewer", vendorId: "" });
  await inviteMember(db, admin, { email: "rep@acme.test", role: "vendorGuest", vendorId });
  reviewer = await memberFor("reviewer@brand.test");
  rep = await memberFor("rep@acme.test");
});

describe("creating a program in steps", () => {
  it("saves files, this program's lead times and the submit date together", async () => {
    const id = await createProgram(db, admin, {
      ...base, name: "Full", inStoreDate: addDays(today, 200), vendorId, submitNow: true,
      leadTimes: { production: { days: "30", unit: "working" }, quote: { days: "", unit: "working" } },
      files: [{ kind: "artwork", url: "https://files.test/art.ai" }, { kind: "specs", url: " " }, { kind: "shipTo", url: "https://files.test/ship.xlsx" }],
    });
    const view = (await getProgramView(db, admin, id))!;
    expect(view.completed.submit).toBe(today);
    expect(view.leadTimes.production).toMatchObject({ days: 30, source: { kind: "program" } });
    expect(view.leadTimes.quote.source.kind).toBe("profile");
    expect((await listProgramFiles(db, rep, id)).map((f) => f.kind)).toEqual(["artwork", "shipTo"]);
    const activity = await listActivity(db, admin, view.program);
    expect(activity.map((a) => a.summary)).toEqual([expect.stringContaining("submitted it to the vendor")]);
  });

  it("refuses bad input and saves nothing", async () => {
    const before = (await listProgramViews(db, admin)).length;
    const input = { ...base, name: "Bad", inStoreDate: addDays(today, 200), vendorId };
    await expect(createProgram(db, admin, { ...input, vendorId: "", submitNow: true })).rejects.toThrow(/Choose a vendor/);
    await expect(createProgram(db, admin, { ...input, files: [{ kind: "artwork", url: "ftp://x" }] })).rejects.toThrow(/https/);
    await expect(createProgram(db, admin, { ...input, files: [{ kind: "virus", url: "https://x.test" }] })).rejects.toThrow(InputError);
    await expect(createProgram(db, admin, { ...input, leadTimes: { production: { days: "900", unit: "working" } } })).rejects.toThrow(InputError);
    expect((await listProgramViews(db, admin)).length).toBe(before);
  });

  it("keeps a plan away from the vendor until it is submitted", async () => {
    const id = await createProgram(db, admin, { ...base, name: "Plan", inStoreDate: addDays(today, 210), vendorId });
    expect(await getProgramView(db, rep, id)).toBeUndefined();
    await expect(findVisibleProgram(db, rep, id)).rejects.toThrow(InputError);
    await completeNextMilestone(db, admin, id, "submit");
    expect(await getProgramView(db, rep, id)).toBeDefined();
  });
});

describe("files", () => {
  it("can be added and removed by the brand only, and are logged", async () => {
    const id = await createProgram(db, admin, { ...base, name: "Files", inStoreDate: addDays(today, 220), vendorId, submitNow: true });
    await addProgramFile(db, admin, { programId: id, kind: "quantities", url: "https://files.test/q.csv" });
    await expect(addProgramFile(db, rep, { programId: id, kind: "other", url: "https://files.test/x" })).rejects.toThrow(ForbiddenError);
    await expect(addProgramFile(db, admin, { programId: id, kind: "other", url: "javascript:1" })).rejects.toThrow(/https/);
    const [file] = await listProgramFiles(db, admin, id);
    await expect(removeProgramFile(db, reviewer, file.id)).rejects.toThrow(ForbiddenError);
    await removeProgramFile(db, admin, file.id);
    expect(await listProgramFiles(db, admin, id)).toEqual([]);
    const program = await findVisibleProgram(db, admin, id);
    expect((await listActivity(db, admin, program)).filter((a) => a.type === "file")).toHaveLength(2);
    await expect(listActivity(db, rep, program)).rejects.toThrow(ForbiddenError);
  });
});

describe("notices", () => {
  let programId: string;
  let proofId: string;

  it("tells the vendor's contacts about a submitted program", async () => {
    programId = await createProgram(db, admin, { ...base, name: "Notify", inStoreDate: addDays(today, 230), vendorId, submitNow: true });
    const notice = (await buildNotice(db, admin, { type: "submittedToVendor", programId }))!;
    expect(notice.to).toEqual(["rep@acme.test"]);
    expect(notice.vendorRecipients).toEqual(["rep@acme.test"]);
    expect(notice.path.vendor).toBe("/vendor");
    expect(notice.subject).toContain("Notify");
  });

  it("tells the program owner when the vendor sets a status, but not when the brand logs one", async () => {
    await setVendorStatus(db, rep, { programId, state: "backlogged", note: "", expectedStart: addDays(today, 30) });
    const notice = (await buildNotice(db, rep, { type: "vendorStatus", programId }))!;
    expect(notice.to).toEqual(["admin@brand.test"]);
    expect(notice.subject).toMatch(/Acme Displays is backlogged on Notify/);
    expect(notice.text).toContain("They can start");
    expect(notice.path.brand).toBe(`/programs/${programId}`);
    await setVendorStatus(db, admin, { programId, state: "working", note: "", expectedStart: "" });
    expect(await buildNotice(db, admin, { type: "vendorStatus", programId })).toBeUndefined();
  });

  it("tells reviewers about a new proof and the vendor about the decision, never the person who acted", async () => {
    proofId = await submitProof(db, rep, { programId, kind: "quoteApproved", url: "https://files.test/quote.pdf", note: "" });
    const sent = (await buildNotice(db, rep, { type: "proofSent", proofId }))!;
    expect(sent.to.sort()).toEqual(["admin@brand.test", "reviewer@brand.test"]);
    expect(sent.path.brand).toBe(`/approvals/${proofId}`);
    await decideProof(db, reviewer, { proofId, decision: "changesRequested", note: "Too expensive" });
    const decided = (await buildNotice(db, reviewer, { type: "proofDecided", proofId }))!;
    expect(decided.to).toEqual(["rep@acme.test"]);
    expect(decided.text).toContain("Too expensive");
    const program = await findVisibleProgram(db, admin, programId);
    expect((await listActivity(db, admin, program)).map((a) => a.type)).toEqual(expect.arrayContaining(["vendorStatus", "proofSent", "proofDecided"]));
  });

  it("stays inside the workspace", async () => {
    const { token } = await createLoginToken(db, "other@elsewhere.test");
    const { user } = await consumeLoginToken(db, token);
    await createWorkspace(db, user, { name: "Elsewhere", timezone: "UTC", withSamples: false });
    const outsider = (await findMember(db, user))!;
    expect(await buildNotice(db, outsider, { type: "submittedToVendor", programId })).toBeUndefined();
    expect(await buildNotice(db, outsider, { type: "proofSent", proofId })).toBeUndefined();
  });
});
