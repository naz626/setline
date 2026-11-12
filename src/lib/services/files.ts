import { and, asc, eq } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Db } from "@/lib/db/client";
import { programFileKindEnum, programFiles } from "@/lib/db/schema";
import type { ProgramFileKind, ProgramFileRow } from "@/lib/db/schema";
import { recordActivity } from "./activity";
import { InputError } from "./errors";
import type { Member } from "./member";
import { findVisibleProgram, parseLink } from "./programs";

export const FILE_KINDS = programFileKindEnum.enumValues;
export const FILE_LABELS: Record<ProgramFileKind, string> = {
  artwork: "Artwork",
  specs: "Specs",
  quantities: "Quantities",
  shipTo: "Ship-to list",
  other: "Other file",
};
export const MAX_FILES = 40;

export function parseFileKind(kind: string): ProgramFileKind {
  if (!(FILE_KINDS as readonly string[]).includes(kind)) throw new InputError("Choose what kind of file this is.");
  return kind as ProgramFileKind;
}

/** Files for a program. Vendor guests see them for their own programs, because the files are for them. */
export async function listProgramFiles(db: Db, member: Member, programId: string): Promise<ProgramFileRow[]> {
  const program = await findVisibleProgram(db, member, programId);
  return db.select().from(programFiles).where(eq(programFiles.programId, program.id)).orderBy(asc(programFiles.kind), asc(programFiles.createdAt));
}

export async function addProgramFile(db: Db, member: Member, input: { programId: string; kind: string; url: string }): Promise<void> {
  assertCan(member.membership.role, "files.manage");
  const program = await findVisibleProgram(db, member, input.programId);
  const kind = parseFileKind(input.kind);
  const url = parseLink(input.url, "The file link");
  const existing = await db.select({ id: programFiles.id }).from(programFiles).where(eq(programFiles.programId, program.id));
  if (existing.length >= MAX_FILES) throw new InputError(`A program can hold up to ${MAX_FILES} files.`);
  await db.transaction(async (tx) => {
    await tx.insert(programFiles).values({ workspaceId: member.workspace.id, programId: program.id, kind, url, addedBy: member.user.id });
    await recordActivity(tx, member, program.id, "file", `Added a file: ${FILE_LABELS[kind]}`);
  });
}

export async function removeProgramFile(db: Db, member: Member, fileId: string): Promise<void> {
  assertCan(member.membership.role, "files.manage");
  const [file] = await db.select().from(programFiles).where(and(eq(programFiles.id, fileId), eq(programFiles.workspaceId, member.workspace.id)));
  if (!file) throw new InputError("That file is no longer on the program.");
  await db.transaction(async (tx) => {
    await tx.delete(programFiles).where(eq(programFiles.id, file.id));
    await recordActivity(tx, member, file.programId, "file", `Removed a file: ${FILE_LABELS[file.kind]}`);
  });
}
