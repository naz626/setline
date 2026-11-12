import { UPLOAD_PREFIX } from "@/lib/services/programs";

/** Uploads need the file store connected (on Vercel). Without it, files are added as links. */
export function uploadsConfigured(env = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** What can be uploaded. No HTML or SVG, because files are served from the app's own address. */
export const UPLOAD_TYPES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/tiff",
  "application/postscript", "application/illustrator", "image/vnd.adobe.photoshop", "application/zip", "application/x-zip-compressed",
  "text/csv", "text/plain", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream",
];
/** Shown in the browser. Everything else downloads. */
export const INLINE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

export type FileKind = "proof" | "program" | "guideline" | "store";

export function isUpload(url: string): boolean {
  return url.startsWith(UPLOAD_PREFIX);
}

/** Where a saved file opens: uploads go through the app, which checks access; links open directly. */
export function fileHref(kind: FileKind, id: string, url: string): string {
  return isUpload(url) ? `/files/${kind}/${id}` : url;
}

/** A short description of where the file lives, for display next to its name. */
export function fileSource(url: string): string {
  if (isUpload(url)) return decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
