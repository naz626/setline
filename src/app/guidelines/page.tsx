import { deleteGuidelineAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { AddVersionForm, NewGuidelineForm } from "@/components/GuidelineForms";
import { StatusPill } from "@/components/StatusPill";
import { can } from "@/lib/auth/permissions";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { guidelineTypeEnum } from "@/lib/db/schema";
import { GUIDELINE_LABELS, listGuidelines } from "@/lib/services/guidelines";
import { listProgramViews } from "@/lib/services/programs";
import { listVendors } from "@/lib/services/vendors";
import { HEALTH_STYLES } from "@/lib/status";
import { formatShort } from "@/lib/timeline";
import { formatStamp, todayInZone } from "@/lib/today";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const APPLIES = { store: "Attached to every program for this retailer", brand: "Attached to every program", vendor: "Attached to every program with this vendor" };

async function Guidelines() {
  const member = await requireBrandMember();
  const db = await getDb();
  const [items, vendorList, views] = await Promise.all([listGuidelines(db, member), listVendors(db, member), listProgramViews(db, member)]);
  const vendorRows = vendorList.map(({ vendor }) => ({ id: vendor.id, name: vendor.name }));
  const canEdit = can(member.membership.role, "guidelines.edit");
  const today = todayInZone(member.workspace.timezone);
  const zone = member.workspace.timezone;
  const retailers = [...new Set(views.map((v) => v.program.retailer).filter(Boolean))].sort();

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Guidelines</h1>
        <p className="mt-1.5 text-[15px] text-muted">Store, brand and vendor rules in one place. The newest version is attached to the right programs for you.</p>
      </div>

      {canEdit && (
        <section className={CARD}>
          <h2 className="mb-3 font-display text-xl font-bold">Add a guideline</h2>
          <NewGuidelineForm vendors={vendorRows} retailers={retailers} />
        </section>
      )}

      {items.length === 0 && (
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">No guidelines yet</h2>
          <p className="mt-2 text-sm text-muted">Add a link to a retailer&rsquo;s store guidelines, your brand book or a vendor&rsquo;s file specs. Vendors see the ones that apply to their programs.</p>
        </section>
      )}

      {guidelineTypeEnum.enumValues.map((type) => {
        const matching = items.filter((item) => item.guideline.type === type);
        if (matching.length === 0) return null;
        return (
          <section key={type} className="flex flex-col gap-4" aria-labelledby={`type-${type}`}>
            <h2 id={`type-${type}`} className="font-display text-2xl font-bold tracking-tight">{GUIDELINE_LABELS[type]}</h2>
            {matching.map(({ guideline, vendorName, versions }) => {
              const reviewDue = guideline.reviewBy && guideline.reviewBy <= today;
              return (
                <article key={guideline.id} className={`${CARD} flex flex-col gap-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold">{guideline.title}</h3>
                      <p className="mt-1 text-sm text-muted">{[guideline.retailer || vendorName, APPLIES[type]].filter(Boolean).join(" · ")}</p>
                    </div>
                    {guideline.reviewBy && (reviewDue
                      ? <StatusPill style={{ ...HEALTH_STYLES.atRisk, label: `Review was due ${formatShort(guideline.reviewBy)}` }} />
                      : <span className="text-[13px] text-muted">Review by {formatShort(guideline.reviewBy)}</span>)}
                  </div>
                  <ul>
                    {versions.map((version, i) => (
                      <li key={version.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-1.5 last:border-b-0">
                        <a href={version.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2 text-sm font-semibold underline hover:text-accent-text">
                          {version.label}{i === 0 ? " (current)" : ""}<span className="sr-only"> of {guideline.title}, opens in a new tab</span>
                        </a>
                        <span className="text-[13px] text-muted">Added {formatStamp(version.createdAt, zone)}</span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <details className="rounded-[14px] border border-line">
                      <summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold">Add a version or remove<span className="sr-only">: {guideline.title}</span></summary>
                      <div className="flex flex-col gap-4 border-t border-line p-4">
                        <AddVersionForm guidelineId={guideline.id} title={guideline.title} />
                        <form action={deleteGuidelineAction}>
                          <input type="hidden" name="id" value={guideline.id} />
                          <button type="submit" className="h-11 rounded-[10px] border-[1.5px] border-[#9B1C1C] px-3.5 text-[13px] font-semibold text-[#9B1C1C]">Remove this guideline and its versions</button>
                        </form>
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

export default function GuidelinesPage() {
  return (
    <AppShell active="/guidelines">
      <Guidelines />
    </AppShell>
  );
}
