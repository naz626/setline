import { handleUpload } from "@vercel/blob/client";
import type { HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { can } from "@/lib/auth/permissions";
import { getCurrentMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { assertWritable } from "@/lib/services/billing";
import { uploadFolder } from "@/lib/services/programs";
import { assertStorageAvailable, recordUpload } from "@/lib/services/storage";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, uploadsConfigured } from "@/lib/uploads";

/**
 * Hands the browser a short-lived token to upload one file straight to file storage.
 * The token only works inside the signed-in person's workspace folder.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!uploadsConfigured()) return NextResponse.json({ error: "Uploads are not set up." }, { status: 503 });
  const body = (await request.json()) as HandleUploadBody;
  const db = await getDb();
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const member = await getCurrentMember();
        if (!member) throw new Error("Sign in to upload files.");
        if (!can(member.membership.role, "files.upload")) throw new Error("Your role cannot upload files.");
        assertWritable(member);
        if (!pathname.startsWith(uploadFolder(member.workspace.id)) || pathname.includes("..")) throw new Error("That upload is not allowed.");
        try {
          await assertStorageAvailable(db, member);
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : "This workspace is out of storage.");
        }
        return {
          allowedContentTypes: UPLOAD_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ workspaceId: member.workspace.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { workspaceId } = JSON.parse(tokenPayload ?? "{}") as { workspaceId?: string };
        if (!workspaceId) return;
        const { head } = await import("@vercel/blob");
        const { size } = await head(blob.url);
        await recordUpload(db, workspaceId, blob.pathname, size);
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The upload could not start." }, { status: 400 });
  }
}
