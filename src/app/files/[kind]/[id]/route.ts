import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { findProgramFile } from "@/lib/services/files";
import { findGuidelineVersion } from "@/lib/services/guidelines";
import type { Member } from "@/lib/services/member";
import { UPLOAD_PREFIX } from "@/lib/services/programs";
import { getProofDetail } from "@/lib/services/proofs";
import { findSampleUrl } from "@/lib/services/samples";
import { findStorePhoto } from "@/lib/services/stores";
import { INLINE_TYPES, isUpload } from "@/lib/uploads";

/** Finds the saved file reference, but only if this person is allowed to see the record it belongs to. */
async function findUrl(member: Member, kind: string, id: string): Promise<string | undefined> {
  const db = await getDb();
  if (kind === "proof") return (await getProofDetail(db, member, id))?.proof.url;
  if (kind === "program") return (await findProgramFile(db, member, id))?.url;
  if (kind === "guideline") return (await findGuidelineVersion(db, member, id))?.url;
  if (kind === "store") return findStorePhoto(db, member, id);
  if (kind === "sample") return findSampleUrl(db, member, id);
  return undefined;
}

/** Serves an uploaded file after checking access right here, next to the read. Links are redirected to. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }): Promise<NextResponse> {
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(new URL("/sign-in", request.url));
  const { kind, id } = await params;
  const url = await findUrl(member, kind, id);
  if (!url) return new NextResponse("Not found", { status: 404 });
  if (!isUpload(url)) return NextResponse.redirect(url);

  const pathname = url.slice(UPLOAD_PREFIX.length);
  const result = await get(pathname, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
  if (!result) return new NextResponse("Not found", { status: 404 });
  const headers = { ETag: result.blob.etag, "Cache-Control": "private, no-cache" };
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers });

  const type = result.blob.contentType;
  const name = encodeURIComponent(decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1)));
  return new NextResponse(result.stream, {
    headers: {
      ...headers,
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${INLINE_TYPES.includes(type) ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
    },
  });
}
