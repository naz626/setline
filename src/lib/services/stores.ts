import { and, asc, count, eq, isNull } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { programStores } from "@/lib/db/schema";
import type { ProgramStoreRow } from "@/lib/db/schema";
import { todayInZone } from "@/lib/today";
import { InputError } from "./errors";
import type { Member } from "./member";
import { recordActivity } from "./activity";
import { findVisibleProgram, parseLink } from "./programs";
import { forgetUpload } from "./storage";

export const STORE_STEPS = ["shipped", "delivered", "installed"] as const;
export type StoreStep = (typeof STORE_STEPS)[number];
export const STORE_STEP_LABELS: Record<StoreStep, string> = { shipped: "Shipped", delivered: "Delivered", installed: "Installed" };
const COLUMN = { shipped: "shippedOn", delivered: "deliveredOn", installed: "installedOn" } as const;
export const MAX_STORES = 2000;

export function storeStep(store: ProgramStoreRow): StoreStep | undefined {
  return store.installedOn ? "installed" : store.deliveredOn ? "delivered" : store.shippedOn ? "shipped" : undefined;
}

export async function listStores(db: Db, member: Member, programId: string): Promise<ProgramStoreRow[]> {
  const program = await findVisibleProgram(db, member, programId);
  const rows = await db.select().from(programStores).where(eq(programStores.programId, program.id)).orderBy(asc(programStores.storeNumber));
  // Store numbers are text, so sort 9 before 10.
  return rows.sort((a, b) => a.storeNumber.localeCompare(b.storeNumber, "en", { numeric: true }));
}

/** Adds stores from pasted lines: a store number, then optionally a comma and a place. Stores already on the list are left alone. */
export async function addStores(db: Db, member: Member, programId: string, pasted: string): Promise<{ added: number; skipped: number }> {
  assertCan(member.membership.role, "stores.manage");
  const program = await findVisibleProgram(db, member, programId);
  const seen = new Set<string>();
  const values = [];
  for (const line of pasted.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [number, ...rest] = line.split(/[,\t]/);
    const storeNumber = number.trim().replace(/^#/, "").slice(0, 40);
    if (!storeNumber || seen.has(storeNumber)) continue;
    seen.add(storeNumber);
    values.push({ workspaceId: member.workspace.id, programId: program.id, storeNumber, location: rest.join(",").trim().slice(0, 160) });
  }
  if (values.length === 0) throw new InputError("Paste at least one store, one per line.");
  const [{ existing }] = await db.select({ existing: count() }).from(programStores).where(eq(programStores.programId, program.id));
  if (existing + values.length > MAX_STORES) throw new InputError(`A program can track up to ${MAX_STORES.toLocaleString("en-US")} stores.`);
  const inserted = await db.insert(programStores).values(values).onConflictDoNothing().returning({ id: programStores.id });
  return { added: inserted.length, skipped: values.length - inserted.length };
}

function parseStep(step: string): StoreStep {
  if (!(STORE_STEPS as readonly string[]).includes(step)) throw new InputError("Choose shipped, delivered or installed.");
  return step as StoreStep;
}

/** Dates this step and any earlier step still empty, so a store marked installed also counts as shipped and delivered. */
function stepUpdate(store: Pick<ProgramStoreRow, "shippedOn" | "deliveredOn" | "installedOn">, step: StoreStep, today: string) {
  const reach = STORE_STEPS.indexOf(step);
  return Object.fromEntries(STORE_STEPS.slice(0, reach + 1).filter((s) => !store[COLUMN[s]]).map((s) => [COLUMN[s], today]));
}

export async function markStore(db: Db, member: Member, storeId: string, stepInput: string): Promise<void> {
  assertCan(member.membership.role, "stores.update");
  const step = parseStep(stepInput);
  const [store] = await db.select().from(programStores).where(and(eq(programStores.id, storeId), eq(programStores.workspaceId, member.workspace.id)));
  if (!store) throw new InputError("That store is no longer on the list.");
  await findVisibleProgram(db, member, store.programId);
  const update = stepUpdate(store, step, todayInZone(member.workspace.timezone));
  if (Object.keys(update).length > 0) await db.update(programStores).set(update).where(eq(programStores.id, store.id));
}

/** Marks every store that has not reached this step yet. Returns how many stores changed. */
export async function markAllStores(db: Db, member: Member, programId: string, stepInput: string): Promise<number> {
  assertCan(member.membership.role, "stores.update");
  const step = parseStep(stepInput);
  const program = await findVisibleProgram(db, member, programId);
  const today = todayInZone(member.workspace.timezone);
  let changed = 0;
  await db.transaction(async (tx) => {
    // One update per step, earliest first, so earlier empty steps are dated too.
    for (const s of STORE_STEPS.slice(0, STORE_STEPS.indexOf(step) + 1)) {
      const rows = await tx.update(programStores).set({ [COLUMN[s]]: today }).where(and(eq(programStores.programId, program.id), isNull(programStores[COLUMN[s]]))).returning({ id: programStores.id });
      if (s === step) changed = rows.length;
    }
  });
  return changed;
}

/** Clears a store's progress, for fixing a mistake. */
export async function resetStore(db: Db, member: Member, storeId: string): Promise<void> {
  assertCan(member.membership.role, "stores.manage");
  await db.update(programStores).set({ shippedOn: null, deliveredOn: null, installedOn: null }).where(and(eq(programStores.id, storeId), eq(programStores.workspaceId, member.workspace.id)));
}

export async function removeStore(db: Db, member: Member, storeId: string): Promise<void> {
  assertCan(member.membership.role, "stores.manage");
  await db.delete(programStores).where(and(eq(programStores.id, storeId), eq(programStores.workspaceId, member.workspace.id)));
}

async function findStore(db: Db, member: Member, storeId: string): Promise<ProgramStoreRow> {
  const [store] = await db.select().from(programStores).where(and(eq(programStores.id, storeId), eq(programStores.workspaceId, member.workspace.id)));
  if (!store) throw new InputError("That store is no longer on the list.");
  // Throws for a vendor guest whose vendor is not on the program.
  await findVisibleProgram(db, member, store.programId);
  return store;
}

/**
 * Adds the photo that shows the display set up in a store. A photo is the proof of installation,
 * so it also marks the store installed (and any earlier steps) if it was not already.
 */
export async function setStorePhoto(db: Db, member: Member, storeId: string, photo: string): Promise<void> {
  assertCan(member.membership.role, "stores.photo");
  const store = await findStore(db, member, storeId);
  const photoUrl = parseLink(photo, "The photo", member.workspace.id);
  const steps = stepUpdate(store, "installed", todayInZone(member.workspace.timezone));
  await db.transaction(async (tx) => {
    await tx.update(programStores).set({ ...steps, photoUrl, photoAt: new Date(), photoBy: member.user.id }).where(eq(programStores.id, store.id));
    await recordActivity(tx, member, store.programId, "store", `Added an install photo for store ${store.storeNumber}`);
  });
  // A replaced photo frees the old one's storage.
  if (store.photoUrl && store.photoUrl !== photoUrl) await forgetUpload(db, store.photoUrl);
}

/** Removes a store's photo. The install date stays; use undo to take that back. */
export async function removeStorePhoto(db: Db, member: Member, storeId: string): Promise<void> {
  assertCan(member.membership.role, "stores.manage");
  const store = await findStore(db, member, storeId);
  if (!store.photoUrl) return;
  await db.transaction(async (tx) => {
    await tx.update(programStores).set({ photoUrl: null, photoAt: null, photoBy: null }).where(eq(programStores.id, store.id));
    await recordActivity(tx, member, store.programId, "store", `Removed the install photo for store ${store.storeNumber}`);
  });
  await forgetUpload(db, store.photoUrl);
}

/** The saved photo reference for a store, if this person may see the store's program. */
export async function findStorePhoto(db: Db, member: Member, storeId: string): Promise<string | undefined> {
  try {
    return (await findStore(db, member, storeId)).photoUrl ?? undefined;
  } catch (error) {
    if (error instanceof InputError) return undefined;
    throw error;
  }
}
