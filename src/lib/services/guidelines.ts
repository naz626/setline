import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { assertBrand, assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { guidelineTypeEnum, guidelineVersions, guidelines, vendors } from "@/lib/db/schema";
import type { GuidelineRow, GuidelineType, ProgramRow } from "@/lib/db/schema";
import { InputError } from "./errors";
import type { Member } from "./member";
import { parseDate, parseLink } from "./programs";

export const GUIDELINE_LABELS: Record<GuidelineType, string> = { store: "Store guidelines", brand: "Brand guidelines", vendor: "Vendor guidelines" };

export interface GuidelineView {
  guideline: GuidelineRow;
  vendorName?: string;
  /** Newest first. */
  versions: { id: string; label: string; url: string; createdAt: Date }[];
}

async function withVersions(db: Db, rows: { guideline: GuidelineRow; vendorName: string | null }[]): Promise<GuidelineView[]> {
  if (rows.length === 0) return [];
  const versions = await db
    .select({ id: guidelineVersions.id, guidelineId: guidelineVersions.guidelineId, label: guidelineVersions.label, url: guidelineVersions.url, createdAt: guidelineVersions.createdAt })
    .from(guidelineVersions)
    .where(inArray(guidelineVersions.guidelineId, rows.map((r) => r.guideline.id)))
    .orderBy(desc(guidelineVersions.createdAt));
  return rows.map((r) => ({ guideline: r.guideline, vendorName: r.vendorName ?? undefined, versions: versions.filter((v) => v.guidelineId === r.guideline.id) }));
}

function baseQuery(db: Db, member: Member) {
  return db
    .select({ guideline: guidelines, vendorName: vendors.name })
    .from(guidelines)
    .leftJoin(vendors, eq(vendors.id, guidelines.vendorId))
    .where(eq(guidelines.workspaceId, member.workspace.id))
    .orderBy(asc(guidelines.title));
}

/** The whole library. Brand team only. */
export async function listGuidelines(db: Db, member: Member): Promise<GuidelineView[]> {
  assertBrand(member.membership.role);
  return withVersions(db, await baseQuery(db, member));
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The guidelines that apply to one program: every brand guideline, store guidelines for its retailer,
 * and vendor guidelines for its vendor. Pass a program the person is already allowed to see.
 */
export async function guidelinesForProgram(db: Db, member: Member, program: ProgramRow): Promise<GuidelineView[]> {
  const rows = (await baseQuery(db, member)).filter(({ guideline }) =>
    guideline.type === "brand" ||
    (guideline.type === "store" && program.retailer !== "" && sameName(guideline.retailer, program.retailer)) ||
    (guideline.type === "vendor" && guideline.vendorId !== null && guideline.vendorId === program.vendorId));
  return withVersions(db, rows);
}

function parseLabel(label: string): string {
  const text = label.trim();
  if (!text || text.length > 40) throw new InputError("Give the version a short label, such as v1 or Spring 2027.");
  return text;
}

export interface NewGuidelineInput {
  type: string;
  title: string;
  retailer: string;
  vendorId: string;
  reviewBy: string;
  label: string;
  url: string;
}

export async function createGuideline(db: Db, member: Member, input: NewGuidelineInput): Promise<void> {
  assertCan(member.membership.role, "guidelines.edit");
  if (!(guidelineTypeEnum.enumValues as readonly string[]).includes(input.type)) throw new InputError("Choose a type of guideline.");
  const type = input.type as GuidelineType;
  const title = input.title.trim();
  if (!title || title.length > 160) throw new InputError("Give the guideline a title of up to 160 characters.");
  const retailer = type === "store" ? input.retailer.trim().slice(0, 120) : "";
  if (type === "store" && !retailer) throw new InputError("Say which retailer these store guidelines are for.");
  let vendorId: string | null = null;
  if (type === "vendor") {
    const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.workspaceId, member.workspace.id)));
    if (!vendor) throw new InputError("Choose which vendor these guidelines are for.");
    vendorId = vendor.id;
  }
  const reviewBy = input.reviewBy ? parseDate(input.reviewBy, "The review-by date") : null;
  const label = parseLabel(input.label || "v1");
  const url = parseLink(input.url, "The file link");
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(guidelines).values({ workspaceId: member.workspace.id, type, title, retailer, vendorId, reviewBy }).returning({ id: guidelines.id });
    await tx.insert(guidelineVersions).values({ guidelineId: row.id, label, url, addedBy: member.user.id });
  });
}

async function findGuideline(db: Db, member: Member, id: string) {
  const [row] = await db.select().from(guidelines).where(and(eq(guidelines.id, id), eq(guidelines.workspaceId, member.workspace.id)));
  if (!row) throw new InputError("That guideline no longer exists.");
  return row;
}

export async function addGuidelineVersion(db: Db, member: Member, input: { guidelineId: string; label: string; url: string }): Promise<void> {
  assertCan(member.membership.role, "guidelines.edit");
  const row = await findGuideline(db, member, input.guidelineId);
  await db.insert(guidelineVersions).values({ guidelineId: row.id, label: parseLabel(input.label), url: parseLink(input.url, "The file link"), addedBy: member.user.id });
}

export async function deleteGuideline(db: Db, member: Member, id: string): Promise<void> {
  assertCan(member.membership.role, "guidelines.edit");
  const row = await findGuideline(db, member, id);
  await db.delete(guidelines).where(eq(guidelines.id, row.id));
}
