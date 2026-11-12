"use client";

import { upload } from "@vercel/blob/client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { FIELD } from "./forms";

interface Uploads {
  /** The folder this workspace may upload into, or undefined when uploads are not available. */
  folder?: string;
}
const UploadsContext = createContext<Uploads>({});

export function UploadsProvider({ folder, children }: Uploads & { children: React.ReactNode }) {
  return <UploadsContext value={{ folder }}>{children}</UploadsContext>;
}

const MAX_MB = 25;

/**
 * One file for a form: upload it, or paste a link. The form receives a single field either way,
 * holding the link or a reference to the upload.
 */
export function FileField({ name = "url", label, required = false, accept, onChange }: { name?: string; label: string; required?: boolean; accept?: string; onChange?: (filled: boolean) => void }) {
  const { folder } = useContext(UploadsContext);
  const id = useId();
  const [uploaded, setUploaded] = useState<{ path: string; name: string }>();
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState("");
  const marker = useRef<HTMLInputElement>(null);

  // A form clears itself after it is saved; clear the uploaded file along with it.
  useEffect(() => {
    const form = marker.current?.form;
    if (!form) return;
    const clear = () => setUploaded(undefined);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  async function choose(file: File | undefined) {
    if (!file || !folder) return;
    setError("");
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_MB} MB. Paste a link to it instead.`);
      return;
    }
    setProgress(0);
    try {
      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
      const blob = await upload(`${folder}${crypto.randomUUID()}/${safeName}`, file, {
        access: "private", handleUploadUrl: "/api/upload", contentType: file.type || "application/octet-stream",
        onUploadProgress: (event) => setProgress(Math.round(event.percentage)),
      });
      setUploaded({ path: blob.pathname, name: file.name });
      onChange?.(true);
    } catch {
      setError("The upload did not finish. Try again, or paste a link instead.");
    } finally {
      setProgress(undefined);
    }
  }

  if (uploaded) {
    return (
      <div className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>{label}</span>
        <input ref={marker} type="hidden" name={name} value={`blob:${uploaded.path}`} />
        <div className="flex min-h-11 flex-wrap items-center gap-3 rounded-[10px] border-[1.5px] border-line bg-canvas px-3 py-1.5 font-normal">
          <span className="min-w-0 flex-1 truncate" role="status">Uploaded: {uploaded.name}</span>
          <button type="button" onClick={() => { setUploaded(undefined); onChange?.(false); }} className="h-11 rounded-[10px] px-2 text-[13px] font-semibold underline">Remove<span className="sr-only"> {uploaded.name}</span></button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold">
      <label htmlFor={`${id}-link`}>{label}{folder ? <span className="font-normal text-muted"> (upload a file or paste a link)</span> : null}</label>
      <div className="flex flex-wrap items-center gap-2">
        {folder && (
          <>
            <label htmlFor={`${id}-file`} className={`inline-flex h-11 cursor-pointer items-center rounded-[10px] border-[1.5px] border-ink px-4 text-[13px] font-semibold focus-within:outline-2 focus-within:outline-offset-2 ${progress !== undefined ? "pointer-events-none opacity-60" : ""}`}>
              {progress !== undefined ? `Uploading ${progress}%` : "Upload a file"}
              <input id={`${id}-file`} type="file" accept={accept} className="sr-only" disabled={progress !== undefined} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <span className="text-[13px] font-normal text-muted">or</span>
          </>
        )}
        <input ref={marker} id={`${id}-link`} name={name} type="url" required={required} pattern="https://.*" title="A full https:// address" placeholder="https://" className={`${FIELD} min-w-[180px] flex-1`}
          onChange={(e) => onChange?.(e.target.value.trim() !== "")} />
      </div>
      {progress !== undefined && <span className="sr-only" role="status">Uploading, {progress} percent</span>}
      {error && <span role="alert" className="text-[13px] font-medium text-[#9B1C1C]">{error}</span>}
      {folder && <span className="text-[12px] font-normal text-muted">Up to {MAX_MB} MB per file.</span>}
    </div>
  );
}
