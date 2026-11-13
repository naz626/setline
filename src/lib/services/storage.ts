import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { uploads } from "@/lib/db/schema";
import { uploadsConfigured } from "@/lib/uploads";
import { memberPlanState } from "./billing";
import { InputError } from "./errors";
import type { Member } from "./member";
import { UPLOAD_PREFIX } from "./programs";

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Bytes a workspace's uploads are using right now, by our own record of what finished uploading. */
export async function storageUsedBytes(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${uploads.bytes}), 0)` }).from(uploads).where(eq(uploads.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}

/** Refuses a new upload once the workspace is already at or over its plan's storage limit. */
export async function assertStorageAvailable(db: Db, member: Member): Promise<void> {
  const { plan } = memberPlanState(member);
  if (plan.storageGb === undefined) return;
  const used = await storageUsedBytes(db, member.workspace.id);
  if (used >= plan.storageGb * BYTES_PER_GB) {
    throw new InputError(`The ${plan.name} plan includes ${plan.storageGb} GB of storage and this workspace is using all of it. Remove a file, or change plan on the Billing page.`);
  }
}

/** Records a finished upload's size against its workspace, for storage accounting. */
export async function recordUpload(db: Db, workspaceId: string, pathname: string, bytes: number): Promise<void> {
  await db.insert(uploads).values({ pathname, workspaceId, bytes }).onConflictDoUpdate({ target: uploads.pathname, set: { bytes } });
}

/**
 * Frees the space an uploaded file (referenced the way `blob:<pathname>` links are) was using:
 * deletes it from file storage and drops our accounting row. A plain https link is not ours to
 * free, so this is a no-op for those. Best-effort: a storage error here should not stop the
 * caller's own change (the file reference) from being removed.
 */
export async function forgetUpload(db: Db, url: string): Promise<void> {
  if (!url.startsWith(UPLOAD_PREFIX)) return;
  const pathname = url.slice(UPLOAD_PREFIX.length);
  if (uploadsConfigured()) {
    try {
      const { del } = await import("@vercel/blob");
      await del(pathname);
    } catch {
      // The file may already be gone, or storage may be unreachable; the accounting row below still clears.
    }
  }
  await db.delete(uploads).where(eq(uploads.pathname, pathname));
}
