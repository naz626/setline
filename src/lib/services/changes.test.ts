import { beforeAll, describe, expect, it } from "vitest";
import { consumeLoginToken, createLoginToken } from "@/lib/auth/core";
import { ForbiddenError } from "@/lib/auth/permissions";
import { createLocalDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import { addDays } from "@/lib/timeline";
import { todayInZone } from "@/lib/today";
import { listActivity } from "./activity";
import { acknowledgeChange, countUnseenChanges, listChanges, logChange } from "./changes";
import { InputError } from "./errors";
import { findMember } from "./member";
import type { Member } from "./member";
import { buildNotice } from "./notices";
import {
  completeNextMilestone, createProgram, findVisibleProgram, getProgramView, moveInStoreDate, setMilestoneDate, undoMilestone, updateProgramDetails, updateProgramLeadTimes,
} from "./programs";
import { approvalStatus, decideProof, getProofDetail, listProofsForProgram, submitProof, versionStatus } from "./proofs";
import { inviteMember } from "./team";
import { completeVendorMilestone, createVendor } from "./vendors";
import { createWorkspace } from "./workspace";

let db: Db;
let admin: Member;
let designer: Member;
let reviewer: Member;
let rep: Member;
let otherRep: Member;
let vendorId: string;
let today: string;

async function memberFor(email: string): Promise<Member> {
  const { token } = await createLoginToken(db, email);
  const { user } = await consumeLoginToken(db, token);
  return (await findMember(db, user))!;
}

const submitted = (name: string) =>
  createProgram(db, admin, { name, retailer: "Northline", displayType: "Endcap", storeCount: "40", inStoreDate: addDays(today, 200), vendorId, submitNow: true });
const send = (member: Member, programId: string, kind: string, file: string) => submitProof(db, member, { programId, kind, url: `https://files.test/${file}`, note: "" });
const view = async (id: string) => (await getProgramView(db, admin, id))!;

beforeAll(async () => {
  db = await createLocalDb("memory://");
  const { token } = await createLoginToken(db, "admin@brand.test");
  const { user } = await consumeLoginToken(db, token);
  await createWorkspace(db, user, { name: "Brand", timezone: "America/New_York", withSamples: false });
  admin = (await findMember(db, user))!;
  today = todayInZone("America/New_York");
  vendorId = await createVendor(db, admin, { name: "Acme Displays", makes: "", origin: "domestic", process: "corrugate" });
  const otherVendor = await createVendor(db, admin, { name: "Other Print", makes: "", origin: "domestic", process: "print" });
  await inviteMember(db, admin, { email: "designer@brand.test", role: "designer", vendorId: "" });
  await inviteMember(db, admin, { email: "reviewer@brand.test", role: "reviewer", vendorId: "" });
  await inviteMember(db, admin, { email: "rep@acme.test", role: "vendorGuest", vendorId });
  await inviteMember(db, admin, { email: "rep@other.test", role: "vendorGuest", vendorId: otherVendor });
  designer = await memberFor("designer@brand.test");
  reviewer = await memberFor("reviewer@brand.test");
  rep = await memberFor("rep@acme.test");
  otherRep = await memberFor("rep@other.test");
});

describe("proof versions at any point", () => {
  let id: string;

  it("lets a new version replace one that is still waiting", async () => {
    id = await submitted("Versions");
    const v1 = await send(rep, id, "quoteApproved", "q1.pdf");
    const v2 = await send(rep, id, "quoteApproved", "q2.pdf");
    await expect(decideProof(db, reviewer, { proofId: v1, decision: "approved", note: "" })).rejects.toThrow(/Version 2 has replaced/);
    const [latest, old] = (await getProofDetail(db, admin, v2))!.versions;
    expect([versionStatus(latest, true), versionStatus(old, false)]).toEqual(["needsDecision", "replaced"]);
    await decideProof(db, reviewer, { proofId: v2, decision: "approved", note: "" });
    expect((await view(id)).completed.quoteApproved).toBe(today);
  });

  it("reopens an approval when a new version arrives after it was approved", async () => {
    const v3 = await send(rep, id, "quoteApproved", "q3.pdf");
    const after = await view(id);
    expect(after.completed.quoteApproved).toBeUndefined();
    expect(after.next).toBe("quoteApproved");
    const rows = (await listProofsForProgram(db, admin, id)).filter((p) => p.kind === "quoteApproved");
    expect(rows.map((p, i) => versionStatus(p, i === 0))).toEqual(["needsDecision", "withdrawn", "replaced"]);
    expect(approvalStatus(false, rows[0])).toBe("needsDecision");
    await decideProof(db, reviewer, { proofId: v3, decision: "approved", note: "" });
    expect((await view(id)).next).toBe("structuralProofApproved");
    const program = await findVisibleProgram(db, admin, id);
    expect((await listActivity(db, admin, program)).some((a) => a.summary.includes("reopens the quote approval"))).toBe(true);
  });

  it("stops once the program has shipped", async () => {
    const shippedId = await submitted("Shipped");
    for (const key of ["quoteApproved", "structuralProofApproved", "printProofApproved", "productionComplete", "shipped"]) await completeNextMilestone(db, admin, shippedId, key);
    await expect(send(rep, shippedId, "printProofApproved", "late.pdf")).rejects.toThrow(/has shipped/);
    await expect(logChange(db, admin, { programId: shippedId, category: "artwork", summary: "Too late", reopen: ["printProofApproved"] })).rejects.toThrow(/has shipped/);
    // A change can still be recorded after shipping, it just cannot reopen anything.
    await logChange(db, admin, { programId: shippedId, category: "stores", summary: "Two stores closed", reopen: [] });
  });
});

describe("changes", () => {
  let id: string;
  let changeId: string;

  it("reopens the chosen approvals, even after production, and shows the effect on the dates", async () => {
    id = await submitted("Late change");
    const quote = await send(rep, id, "quoteApproved", "q.pdf");
    await decideProof(db, reviewer, { proofId: quote, decision: "approved", note: "" });
    await completeNextMilestone(db, admin, id, "structuralProofApproved");
    const print = await send(rep, id, "printProofApproved", "p1.pdf");
    await decideProof(db, reviewer, { proofId: print, decision: "approved", note: "" });
    await completeVendorMilestone(db, rep, id, "productionComplete");

    changeId = await logChange(db, designer, { programId: id, category: "artwork", summary: "Retailer moved the price callout", reopen: ["printProofApproved", "printProofApproved"] });
    const after = await view(id);
    expect(after.completed.printProofApproved).toBeUndefined();
    expect(after.completed.productionComplete).toBe(today);
    expect(after.next).toBe("printProofApproved");
    // The vendor cannot mark it shipped until the reopened approval is given again.
    await expect(completeVendorMilestone(db, rep, id, "shipped")).rejects.toThrow(InputError);

    const [latest] = (await listProofsForProgram(db, admin, id)).filter((p) => p.kind === "printProofApproved");
    expect(approvalStatus(false, latest)).toBe("awaitingProof");
    expect(versionStatus(latest, true)).toBe("withdrawn");
    const [change] = await listChanges(db, rep, id);
    expect(change).toMatchObject({ category: "artwork", reopened: ["printProofApproved"], by: "designer@brand.test", acknowledgedAt: null });

    const v2 = await send(rep, id, "printProofApproved", "p2.pdf");
    await decideProof(db, reviewer, { proofId: v2, decision: "approved", note: "" });
    expect((await view(id)).next).toBe("shipped");
  });

  it("does not reopen approvals that were never given", async () => {
    const fresh = await submitted("Early change");
    await logChange(db, admin, { programId: fresh, category: "quantities", summary: "Store count went up", reopen: ["structuralProofApproved"] });
    const [change] = await listChanges(db, admin, fresh);
    expect(change.reopened).toEqual([]);
  });

  it("tracks whether the vendor has seen each change", async () => {
    expect((await countUnseenChanges(db, admin)).get(id)).toBe(1);
    expect((await buildNotice(db, designer, { type: "changeLogged", changeId }))!).toMatchObject({ to: ["rep@acme.test"], subject: "Change to Late change" });
    await expect(acknowledgeChange(db, otherRep, changeId)).rejects.toThrow(InputError);
    await expect(acknowledgeChange(db, reviewer, changeId)).rejects.toThrow(ForbiddenError);
    await acknowledgeChange(db, rep, changeId);
    await acknowledgeChange(db, rep, changeId);
    const [change] = await listChanges(db, admin, id);
    expect(change.acknowledgedBy).toBe("rep@acme.test");
    expect((await countUnseenChanges(db, admin)).get(id)).toBeUndefined();
  });

  it("checks input, roles and that the program is submitted", async () => {
    await expect(logChange(db, rep, { programId: id, category: "artwork", summary: "x", reopen: [] })).rejects.toThrow(ForbiddenError);
    await expect(logChange(db, admin, { programId: id, category: "artwork", summary: " ", reopen: [] })).rejects.toThrow(/Describe/);
    await expect(logChange(db, admin, { programId: id, category: "nope", summary: "x", reopen: [] })).rejects.toThrow(InputError);
    await expect(logChange(db, admin, { programId: id, category: "artwork", summary: "x", reopen: ["inStore"] })).rejects.toThrow(InputError);
    const plan = await createProgram(db, admin, { name: "Plan", retailer: "", displayType: "Endcap", storeCount: "", inStoreDate: addDays(today, 200), vendorId });
    await expect(logChange(db, admin, { programId: plan, category: "artwork", summary: "x", reopen: [] })).rejects.toThrow(/not been submitted/);
    await expect(listChanges(db, otherRep, id)).rejects.toThrow(InputError);
  });
});

describe("fixing mistakes and editing", () => {
  let id: string;

  it("undoes only the most recent key date, and corrects a completion date", async () => {
    id = await submitted("Fixes");
    await completeNextMilestone(db, admin, id, "quoteApproved");
    await expect(undoMilestone(db, admin, id, "submit")).rejects.toThrow(/most recently/);
    await expect(undoMilestone(db, reviewer, id, "quoteApproved")).rejects.toThrow(ForbiddenError);
    await undoMilestone(db, admin, id, "quoteApproved");
    expect((await view(id)).next).toBe("quoteApproved");

    await setMilestoneDate(db, admin, id, "submit", addDays(today, -3));
    expect((await view(id)).completed.submit).toBe(addDays(today, -3));
    await expect(setMilestoneDate(db, admin, id, "submit", addDays(today, 1))).rejects.toThrow(/future/);
    await expect(setMilestoneDate(db, admin, id, "quoteApproved", today)).rejects.toThrow(/not marked as done/);
  });

  it("un-verifies a program when in store is undone", async () => {
    const done = await submitted("Done");
    for (const key of ["quoteApproved", "structuralProofApproved", "printProofApproved", "productionComplete", "shipped", "inStore"]) await completeNextMilestone(db, admin, done, key);
    expect((await view(done)).health).toBe("complete");
    await undoMilestone(db, admin, done, "inStore");
    const after = await view(done);
    expect(after.health).not.toBe("complete");
    expect(after.next).toBe("inStore");
  });

  it("edits details, the in-store date and this program's lead times, and logs each", async () => {
    await updateProgramDetails(db, admin, id, { name: "Fixes v2", retailer: "Northline", displayType: "Floor stand", storeCount: "55" });
    await moveInStoreDate(db, admin, id, addDays(today, 230));
    const before = await view(id);
    const steps = Object.fromEntries(Object.entries(before.leadTimes).map(([step, lead]) => [step, { days: String(lead.days), unit: lead.unit }]));
    await updateProgramLeadTimes(db, admin, id, { ...steps, production: { days: String(before.leadTimes.production.days + 5), unit: "working" } });
    const after = await view(id);
    expect(after.program).toMatchObject({ name: "Fixes v2", displayType: "Floor stand", storeCount: 55, inStoreDate: addDays(today, 230) });
    expect(after.leadTimes.production).toMatchObject({ days: before.leadTimes.production.days + 5, source: { kind: "program" } });
    // Steps left at the profile's number keep following the profile.
    expect(after.leadTimes.quote.source.kind).toBe("profile");
    expect(Object.keys(after.program.leadTimeOverrides)).toEqual(["production"]);
    // Setting it back removes the override.
    await updateProgramLeadTimes(db, admin, id, steps);
    expect((await view(id)).program.leadTimeOverrides).toEqual({});

    const program = await findVisibleProgram(db, admin, id);
    const summaries = (await listActivity(db, admin, program)).map((a) => a.summary).join("\n");
    expect(summaries).toContain("name from “Fixes” to “Fixes v2”");
    expect(summaries).toContain("store count from “40” to “55”");
    expect(summaries).toContain("Moved the in-store date");
    expect(summaries).toContain("Changed this program's lead times: Production from");
    await expect(updateProgramDetails(db, reviewer, id, { name: "x", retailer: "", displayType: "Endcap", storeCount: "" })).rejects.toThrow(ForbiddenError);
    await expect(updateProgramLeadTimes(db, rep, id, steps)).rejects.toThrow(ForbiddenError);
  });
});
