import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusIcon, StatusPill } from "@/components/StatusPill";
import { NewVendorForm, VendorContactForm } from "@/components/VendorForms";
import { can } from "@/lib/auth/permissions";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { processLabel } from "@/lib/options";
import { listProgramViews } from "@/lib/services/programs";
import { listVendors } from "@/lib/services/vendors";
import { HEALTH_STYLES, VENDOR_STYLES } from "@/lib/status";
import type { VendorState } from "@/lib/timeline";
import { formatShort } from "@/lib/timeline";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const STATES: VendorState[] = ["waitingOnYou", "backlogged", "working"];

async function Vendors() {
  const member = await requireBrandMember();
  const db = await getDb();
  const [vendorList, views] = await Promise.all([listVendors(db, member), listProgramViews(db, member)]);
  const canManage = can(member.membership.role, "vendors.manage");
  const active = views.filter((v) => v.vendor && !v.completed.inStore);

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Vendors</h1>
        <p className="mt-1.5 text-[15px] text-muted">Who is making what, and where each program stands with them.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        {STATES.map((key) => {
          const style = VENDOR_STYLES[key];
          const matching = active.filter((v) => v.vendorState === key);
          return (
            <section key={key} className="flex flex-[1_1_240px] flex-col gap-2 rounded-2xl p-5" style={{ background: style.tint }}>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: style.text }}><StatusIcon style={style} size={14} />{style.label}</span>
              <span className="font-display text-[28px] font-bold">{matching.length} {matching.length === 1 ? "program" : "programs"}</span>
              <span className="text-[13px]">{matching.map((v) => v.program.name).join(", ") || "None right now."}</span>
            </section>
          );
        })}
      </div>

      {canManage && (
        <section className={CARD}>
          <h2 className="mb-3 font-display text-xl font-bold">Add a vendor</h2>
          <NewVendorForm />
        </section>
      )}

      {vendorList.length === 0 && (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">No vendors yet</h2>
          <p className="mt-2 text-sm text-muted">Add the companies that make your displays, then invite a contact at each so they can update status themselves.</p>
        </section>
      )}

      {vendorList.map(({ vendor, contacts, invited }) => {
        const programs = views.filter((v) => v.vendor?.id === vendor.id && !v.completed.inStore);
        return (
          <section key={vendor.id} className={`${CARD} flex flex-col gap-4`}>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">{vendor.name}</h2>
              <p className="mt-1 text-sm text-muted">{[vendor.makes, `Made ${vendor.origin}`, processLabel(vendor.process)].filter(Boolean).join(" · ")}</p>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Open programs</h3>
              {programs.length === 0 ? <p className="mt-2 text-sm text-muted">No open programs with this vendor.</p> : (
                <ul>
                  {programs.map((v) => (
                    <li key={v.program.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0">
                      <Link href={`/programs/${v.program.id}`} className="inline-block py-2 text-[15px] font-semibold hover:text-accent-text">{v.program.name}</Link>
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span className="text-[13px] text-muted">In store {formatShort(v.program.inStoreDate)}</span>
                        <StatusPill style={HEALTH_STYLES[v.health]} />
                        {v.vendorState ? <StatusPill style={VENDOR_STYLES[v.vendorState]} /> : <span className="text-[13px] text-muted">No update yet</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Contacts who can sign in</h3>
              {contacts.length + invited.length === 0 ? <p className="text-sm text-muted">Nobody yet. Until a contact joins, your team can log this vendor&rsquo;s status from each program page.</p> : (
                <ul className="text-sm">
                  {contacts.map((email) => <li key={email} className="py-1"><span className="font-semibold">{email}</span> <span className="text-[13px] font-semibold text-[#14633F]">· Active</span></li>)}
                  {invited.map((email) => <li key={email} className="py-1"><span className="font-semibold">{email}</span> <span className="text-[13px] font-semibold text-[#7A4B00]">· Invited</span></li>)}
                </ul>
              )}
              {canManage && <VendorContactForm vendorId={vendor.id} vendorName={vendor.name} />}
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function VendorsPage() {
  return (
    <AppShell active="/vendors">
      <Vendors />
    </AppShell>
  );
}
