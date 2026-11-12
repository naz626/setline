import { beforeAll, describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { addDays } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { InputError } from "./errors";
import { addGuidelineVersion, createGuideline, guidelinesForProgram, listGuidelines } from "./guidelines";
import { findMember } from "./member";
import type { Member } from "./member";
import { assignVendor, completeNextMilestone, createProgram, findVisibleProgram, getProgramView, moveInStoreDate } from "./programs";
import { addProofComment, decideProof, getProofDetail, listApprovalItems, submitProof } from "./proofs";
import { addStores, listStores, markAllStores, markStore, removeStore, resetStore, storeStep } from "./stores";
import { inviteMember, listMembers } from "./team";
import { completeVendorMilestone, createVendor, listStatusHistory, listVendors, setVendorStatus } from "./vendors";
import { createWorkspace } from "./workspace";

let db: Db;
let admin: Member;
let manager: Member;
let reviewer: Member;
let acmeRep: Member;
let otherRep: Member;
let retailer: Member;
let acmeId: string;
let otherId: string;
let programId: string;
let otherProgramId: string;
let today: string;

async function memberFor(email: string): Promise<Member> {
  const { token } = await createLoginToken(db, email);
  const { user } = await consumeLoginToken(db, token);
  const member = await findMember(db, user);
  if (!member) throw new Error(`${email} has no workspace`);
  return member;
}

const newProgram = (name: string, vendorId: string, inStoreDate: string) =>
  createProgram(db, admin, { name, retailer: "Northline", displayType: "Endcap", storeCount: "", inStoreDate, vendorId });

beforeAll(async () => {
  db = await createLocalDb("memory://");
  const { token } = await createLoginToken(db, "admin@brand.test");
  const { user } = await consumeLoginToken(db, token);
  await createWorkspace(db, user, { name: "Brand", timezone: "America/New_York", withSamples: false });
  admin = (await findMember(db, user))!;
  today = todayInZone("America/New_York");

  acmeId = await createVendor(db, admin, { name: "Acme Displays", makes: "Corrugate", origin: "domestic", process: "corrugate" });
  otherId = await createVendor(db, admin, { name: "Other Print", makes: "", origin: "overseas", process: "print" });
  await inviteMember(db, admin, { email: "pm@brand.test", role: "programManager", vendorId: "" });
  await inviteMember(db, admin, { email: "reviewer@brand.test", role: "reviewer", vendorId: "" });
  await inviteMember(db, admin, { email: "store@retailer.test", role: "retailerGuest", vendorId: "" });
  manager = await memberFor("pm@brand.test");
  reviewer = await memberFor("reviewer@brand.test");
  retailer = await memberFor("store@retailer.test");
  // Program managers may invite a vendor's contact, and nobody else.
  await inviteMember(db, manager, { email: "rep@acme.test", role: "vendorGuest", vendorId: acmeId });
  await expect(inviteMember(db, manager, { email: "x@brand.test", role: "designer", vendorId: "" })).rejects.toThrow(ForbiddenError);
  await inviteMember(db, admin, { email: "rep@other.test", role: "vendorGuest", vendorId: otherId });
  acmeRep = await memberFor("rep@acme.test");
  otherRep = await memberFor("rep@other.test");

  const farOut = addDays(today, 200);
  programId = await newProgram("Acme Endcap", acmeId, farOut);
  otherProgramId = await newProgram("Other Endcap", otherId, farOut);
  await completeNextMilestone(db, admin, programId, "submit");
});

describe("vendors", () => {
  it("lists vendors with their contacts for the brand team only", async () => {
    const list = await listVendors(db, admin);
    expect(list.find((v) => v.vendor.id === acmeId)?.contacts).toEqual(["rep@acme.test"]);
    await expect(listVendors(db, acmeRep)).rejects.toThrow(ForbiddenError);
    await expect(listMembers(db, acmeRep)).rejects.toThrow(ForbiddenError);
  });

  it("rejects duplicate names and bad choices", async () => {
    await expect(createVendor(db, admin, { name: "Acme Displays", makes: "", origin: "domestic", process: "corrugate" })).rejects.toThrow(/already/);
    await expect(createVendor(db, admin, { name: "New", makes: "", origin: "mars", process: "corrugate" })).rejects.toThrow(InputError);
    await expect(createVendor(db, reviewer, { name: "New", makes: "", origin: "domestic", process: "corrugate" })).rejects.toThrow(ForbiddenError);
  });
});

describe("vendor status", () => {
  it("lets a vendor contact set status on their own program in one step", async () => {
    await setVendorStatus(db, acmeRep, { programId, state: "working", note: "Die lines in progress", expectedStart: "" });
    const view = (await getProgramView(db, admin, programId))!;
    expect(view.vendorState).toBe("working");
    const history = await listStatusHistory(db, admin, programId);
    expect(history[0]).toMatchObject({ state: "working", note: "Die lines in progress", by: "rep@acme.test" });
  });

  it("refuses another vendor's program, and roles without permission", async () => {
    await expect(setVendorStatus(db, acmeRep, { programId: otherProgramId, state: "working", note: "", expectedStart: "" })).rejects.toThrow(InputError);
    await expect(findVisibleProgram(db, acmeRep, otherProgramId)).rejects.toThrow(InputError);
    await expect(setVendorStatus(db, reviewer, { programId, state: "working", note: "", expectedStart: "" })).rejects.toThrow(ForbiddenError);
    await expect(setVendorStatus(db, retailer, { programId, state: "working", note: "", expectedStart: "" })).rejects.toThrow(ForbiddenError);
  });

  it("needs a start date for a backlog and projects the in-store date from it", async () => {
    const backlogId = await newProgram("Tight Endcap", acmeId, addDays(today, 80));
    await completeNextMilestone(db, admin, backlogId, "submit");
    await expect(setVendorStatus(db, acmeRep, { programId: backlogId, state: "backlogged", note: "", expectedStart: "" })).rejects.toThrow(/expect to start/);
    await expect(setVendorStatus(db, acmeRep, { programId: backlogId, state: "backlogged", note: "", expectedStart: addDays(today, -1) })).rejects.toThrow(/past/);
    await setVendorStatus(db, acmeRep, { programId: backlogId, state: "backlogged", note: "", expectedStart: addDays(today, 60) });
    const late = (await getProgramView(db, admin, backlogId))!;
    expect(late.health).toBe("willMiss");
    expect(late.projected.inStore > late.planned.inStore).toBe(true);

    // The brand's two answers: accept the projected date, or go back to working.
    await moveInStoreDate(db, manager, backlogId, late.projected.inStore);
    const moved = (await getProgramView(db, admin, backlogId))!;
    expect(moved.program.inStoreDate).toBe(late.projected.inStore);
    expect(moved.health).not.toBe("willMiss");
    await expect(moveInStoreDate(db, acmeRep, backlogId, addDays(today, 300))).rejects.toThrow(ForbiddenError);

    await setVendorStatus(db, admin, { programId: backlogId, state: "working", note: "", expectedStart: "" });
    expect((await getProgramView(db, admin, backlogId))!.program.backloggedUntil).toBeNull();
  });

  it("clears the old vendor's status when the vendor changes", async () => {
    const id = await newProgram("Switch", acmeId, addDays(today, 220));
    await completeNextMilestone(db, admin, id, "submit");
    await setVendorStatus(db, acmeRep, { programId: id, state: "waitingOnYou", note: "", expectedStart: "" });
    await assignVendor(db, manager, id, otherId);
    const view = (await getProgramView(db, admin, id))!;
    expect(view.vendor?.id).toBe(otherId);
    expect(view.program.vendorState).toBeNull();
    expect(await getProgramView(db, acmeRep, id)).toBeUndefined();
    await expect(assignVendor(db, manager, id, "nope")).rejects.toThrow(InputError);
    await expect(assignVendor(db, reviewer, id, acmeId)).rejects.toThrow(ForbiddenError);
  });
});

describe("proofs and approvals", () => {
  let quoteId: string;

  it("lets the vendor send a quote and shows it as needing a decision", async () => {
    await expect(submitProof(db, acmeRep, { programId, kind: "quoteApproved", url: "javascript:alert(1)", note: "" })).rejects.toThrow(/https/);
    await expect(submitProof(db, acmeRep, { programId: otherProgramId, kind: "quoteApproved", url: "https://files.test/q.pdf", note: "" })).rejects.toThrow(InputError);
    quoteId = await submitProof(db, acmeRep, { programId, kind: "quoteApproved", url: "https://files.test/quote-v1.pdf", note: "First quote" });
    await expect(submitProof(db, acmeRep, { programId, kind: "quoteApproved", url: "https://files.test/quote-v2.pdf", note: "" })).rejects.toThrow(/still waiting/);
    const item = (await listApprovalItems(db, admin)).find((i) => i.view.program.id === programId && i.kind === "quoteApproved")!;
    expect(item.status).toBe("needsDecision");
    expect(item.latest?.version).toBe(1);
  });

  it("keeps other vendors and retailer guests out", async () => {
    expect(await getProofDetail(db, otherRep, quoteId)).toBeUndefined();
    expect(await getProofDetail(db, retailer, quoteId)).toBeUndefined();
    await expect(listApprovalItems(db, retailer)).rejects.toThrow(ForbiddenError);
    await expect(addProofComment(db, otherRep, quoteId, "hello")).rejects.toThrow(InputError);
    expect((await listApprovalItems(db, otherRep)).every((i) => i.view.program.vendorId === otherId)).toBe(true);
  });

  it("needs a note to request changes, then takes a new version", async () => {
    await expect(decideProof(db, acmeRep, { proofId: quoteId, decision: "approved", note: "" })).rejects.toThrow(ForbiddenError);
    await expect(decideProof(db, reviewer, { proofId: quoteId, decision: "changesRequested", note: " " })).rejects.toThrow(/what needs to change/);
    await decideProof(db, reviewer, { proofId: quoteId, decision: "changesRequested", note: "Unit price is over budget" });
    await expect(decideProof(db, reviewer, { proofId: quoteId, decision: "approved", note: "" })).rejects.toThrow(/already/);
    await addProofComment(db, acmeRep, quoteId, "Revised pricing coming");
    const detail = (await getProofDetail(db, acmeRep, quoteId))!;
    expect(detail.comments.map((c) => c.body)).toEqual(["Revised pricing coming"]);
    quoteId = await submitProof(db, acmeRep, { programId, kind: "quoteApproved", url: "https://files.test/quote-v2.pdf", note: "" });
    expect((await getProofDetail(db, admin, quoteId))!.versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("completes the key date when the next approval is approved", async () => {
    await decideProof(db, reviewer, { proofId: quoteId, decision: "approved", note: "" });
    const view = (await getProgramView(db, admin, programId))!;
    expect(view.completed.quoteApproved).toBe(today);
    expect(view.next).toBe("structuralProofApproved");
    await expect(submitProof(db, acmeRep, { programId, kind: "quoteApproved", url: "https://files.test/q3.pdf", note: "" })).rejects.toThrow(/already approved/);
  });

  it("lets the vendor mark production and shipping, in order only", async () => {
    await expect(completeVendorMilestone(db, acmeRep, programId, "productionComplete")).rejects.toThrow(/not the next/);
    await completeNextMilestone(db, admin, programId, "structuralProofApproved");
    await completeNextMilestone(db, admin, programId, "printProofApproved");
    await expect(completeVendorMilestone(db, otherRep, programId, "productionComplete")).rejects.toThrow(InputError);
    await completeVendorMilestone(db, acmeRep, programId, "productionComplete");
    await expect(completeVendorMilestone(db, acmeRep, programId, "inStore")).rejects.toThrow(InputError);
    await completeVendorMilestone(db, acmeRep, programId, "shipped");
    expect((await getProgramView(db, admin, programId))!.next).toBe("inStore");
    await expect(assignVendor(db, admin, programId, otherId)).rejects.toThrow(/already complete/);
  });
});

describe("guidelines", () => {
  it("attaches the right guidelines to each program", async () => {
    const link = "https://files.test/guide.pdf";
    await createGuideline(db, admin, { type: "brand", title: "Brand book", retailer: "", vendorId: "", reviewBy: "", label: "", url: link });
    await createGuideline(db, admin, { type: "store", title: "Northline store rules", retailer: "northline ", vendorId: "", reviewBy: "2027-01-01", label: "2026", url: link });
    await createGuideline(db, admin, { type: "store", title: "Elsewhere store rules", retailer: "Elsewhere", vendorId: "", reviewBy: "", label: "v1", url: link });
    await createGuideline(db, admin, { type: "vendor", title: "Other Print file specs", retailer: "", vendorId: otherId, reviewBy: "", label: "v1", url: link });
    const program = await findVisibleProgram(db, acmeRep, programId);
    expect((await guidelinesForProgram(db, acmeRep, program)).map((g) => g.guideline.title)).toEqual(["Brand book", "Northline store rules"]);
    const other = await findVisibleProgram(db, admin, otherProgramId);
    expect((await guidelinesForProgram(db, admin, other)).map((g) => g.guideline.title)).toContain("Other Print file specs");
  });

  it("keeps versions newest first and checks input and roles", async () => {
    const [book] = (await listGuidelines(db, admin)).filter((g) => g.guideline.title === "Brand book");
    await addGuidelineVersion(db, admin, { guidelineId: book.guideline.id, label: "v2", url: "https://files.test/guide-v2.pdf" });
    const [updated] = (await listGuidelines(db, admin)).filter((g) => g.guideline.title === "Brand book");
    expect(updated.versions.map((v) => v.label)).toEqual(["v2", "v1"]);
    await expect(createGuideline(db, admin, { type: "store", title: "No retailer", retailer: "", vendorId: "", reviewBy: "", label: "v1", url: "https://files.test/x" })).rejects.toThrow(/retailer/);
    await expect(createGuideline(db, admin, { type: "brand", title: "Bad link", retailer: "", vendorId: "", reviewBy: "", label: "v1", url: "http://files.test/x" })).rejects.toThrow(/https/);
    await expect(createGuideline(db, reviewer, { type: "brand", title: "Nope", retailer: "", vendorId: "", reviewBy: "", label: "v1", url: "https://files.test/x" })).rejects.toThrow(ForbiddenError);
    await expect(listGuidelines(db, acmeRep)).rejects.toThrow(ForbiddenError);
  });
});

describe("store rollout", () => {
  it("adds pasted stores once and sorts by number", async () => {
    expect(await addStores(db, admin, programId, "10, Dallas TX\n#9, Austin TX\n\n10, Dallas again\n1042\tHouston, TX")).toEqual({ added: 3, skipped: 0 });
    expect(await addStores(db, admin, programId, "9\n11")).toEqual({ added: 1, skipped: 1 });
    const stores = await listStores(db, admin, programId);
    expect(stores.map((s) => s.storeNumber)).toEqual(["9", "10", "11", "1042"]);
    expect(stores[3].location).toBe("Houston, TX");
    await expect(addStores(db, acmeRep, programId, "12")).rejects.toThrow(ForbiddenError);
    await expect(addStores(db, admin, programId, " \n ")).rejects.toThrow(InputError);
  });

  it("lets the vendor mark steps, filling earlier ones, on their own programs only", async () => {
    const [first, second] = await listStores(db, admin, programId);
    await markStore(db, acmeRep, first.id, "delivered");
    await expect(markStore(db, otherRep, second.id, "shipped")).rejects.toThrow(InputError);
    await expect(markStore(db, retailer, second.id, "shipped")).rejects.toThrow(ForbiddenError);
    const [updated] = await listStores(db, admin, programId);
    expect(updated).toMatchObject({ shippedOn: today, deliveredOn: today, installedOn: null });
    expect(storeStep(updated)).toBe("delivered");
    expect(await markAllStores(db, acmeRep, programId, "shipped")).toBe(3);
    expect((await listStores(db, admin, programId)).every((s) => s.shippedOn === today)).toBe(true);
  });

  it("lets the brand undo and remove", async () => {
    const [first, second] = await listStores(db, admin, programId);
    await expect(resetStore(db, acmeRep, first.id)).rejects.toThrow(ForbiddenError);
    await resetStore(db, admin, first.id);
    await removeStore(db, admin, second.id);
    const stores = await listStores(db, admin, programId);
    expect(stores).toHaveLength(3);
    expect(storeStep(stores[0])).toBeUndefined();
  });
});
