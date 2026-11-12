import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CommentForm, DecideProofForm } from "@/components/ProofForms";
import { StatusPill } from "@/components/StatusPill";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PROOF_LABELS, getProofDetail, versionStatus } from "@/lib/services/proofs";
import { VERSION_STYLES } from "@/lib/status";
import { formatStamp } from "@/lib/today";
import { fileHref, fileSource, isUpload } from "@/lib/uploads";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";

async function Proof({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;
  const detail = await getProofDetail(await getDb(), member, id);
  if (!detail) notFound();

  const { proof, program, versions, comments, uploadedBy } = detail;
  const role = member.membership.role;
  const vendorSide = role === "vendorGuest";
  const zone = member.workspace.timezone;
  const isLatest = versions[0].id === proof.id;
  const status = versionStatus(proof, isLatest);
  const style = VERSION_STYLES[status];
  const kind = PROOF_LABELS[proof.kind];

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="text-[13px] text-muted">
          <Link href="/approvals" className="inline-block py-3 hover:text-accent-text">{vendorSide ? "Proofs" : "Approvals"}</Link> /{" "}
          {vendorSide ? program.name : <Link href={`/programs/${program.id}`} className="inline-block py-3 hover:text-accent-text">{program.name}</Link>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-bold tracking-tight">{kind}, version {proof.version}</h1>
          <StatusPill style={vendorSide && status === "needsDecision" ? { ...style, label: "With the brand" } : style} />
        </div>
        <p className="text-sm text-muted">Sent {formatStamp(proof.createdAt, zone)}{uploadedBy ? ` by ${uploadedBy}` : ""}</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          <section className={`${CARD} flex flex-col gap-3`}>
            <h2 className="font-display text-xl font-bold">The file</h2>
            {proof.note && <p className="text-sm leading-relaxed">{proof.note}</p>}
            <a href={fileHref("proof", proof.id, proof.url)} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center self-start rounded-xl bg-accent px-5 text-sm font-semibold text-ink">
              Open the {kind.toLowerCase()}<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="text-[13px] break-all text-muted">{isUpload(proof.url) ? `Uploaded file: ${fileSource(proof.url)}` : proof.url}</p>
          </section>

          <section className={`${CARD} flex flex-col gap-4`}>
            <h2 className="font-display text-xl font-bold">Comments</h2>
            {comments.length === 0 ? <p className="text-sm text-muted">No comments on this version yet.</p> : (
              <ul className="flex flex-col gap-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-[14px] bg-canvas px-4 py-3">
                    <p className="text-[13px] text-muted"><span className="font-semibold text-ink">{comment.author ?? "Someone who has left"}</span> · {formatStamp(comment.createdAt, zone)}</p>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {can(role, "proofs.comment") && <CommentForm proofId={proof.id} />}
          </section>
        </div>

        <div className="flex flex-[1_1_320px] flex-col gap-6">
          <section className={`${CARD} flex flex-col gap-3`}>
            <h2 className="font-display text-xl font-bold">Decision</h2>
            {!isLatest && (
              <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm">
                Version {versions[0].version} has replaced this one. <Link href={`/approvals/${versions[0].id}`} className="font-semibold underline">Open the newest version</Link>
              </p>
            )}
            {proof.reopenedAt && isLatest && <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm">A later change reopened this approval, so it needs a new version.</p>}
            {proof.decision ? (
              <>
                <p className="text-sm"><span className="font-semibold">{proof.decision === "approved" ? "Approved" : "Changes requested"}</span>{proof.decidedAt ? ` on ${formatStamp(proof.decidedAt, zone)}` : ""}</p>
                {proof.decisionNote && <p className="rounded-[14px] bg-canvas px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{proof.decisionNote}</p>}
                {proof.decision === "changesRequested" && versions[0].id === proof.id && (
                  <p className="text-[13px] text-muted">{vendorSide ? "Send a new version from your programs page." : "The vendor can now send a new version."}</p>
                )}
              </>
            ) : !isLatest ? (
              <p className="text-sm text-muted">No decision was made on this version.</p>
            ) : can(role, "proofs.decide") ? (
              <DecideProofForm proofId={proof.id} />
            ) : (
              <p className="text-sm text-muted">{vendorSide ? "The brand has not decided yet." : "Waiting for a reviewer to decide."}</p>
            )}
          </section>

          <section className={CARD}>
            <h2 className="font-display text-xl font-bold">Versions</h2>
            <ul className="mt-2">
              {versions.map((version) => {
                const versionStyle = VERSION_STYLES[versionStatus(version, version.id === versions[0].id)];
                return (
                  <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
                    {version.id === proof.id ? <span className="py-2.5 text-sm font-semibold" aria-current="page">Version {version.version} (this one)</span> : (
                      <Link href={`/approvals/${version.id}`} className="inline-block py-2.5 text-sm font-semibold underline hover:text-accent-text">Version {version.version}</Link>
                    )}
                    <StatusPill style={versionStyle} />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

export default function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell active="/approvals">
      <Proof params={params} />
    </AppShell>
  );
}
