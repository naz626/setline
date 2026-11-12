import { asc, eq } from "drizzle-orm";
import { deleteProfileAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { NewProfileForm, ProfileForm } from "@/components/LeadTimeForms";
import { LeadTimePlanner } from "@/components/LeadTimePlanner";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { vendors } from "@/lib/db/schema";
import { scopeText } from "@/lib/leadTimeScope";
import { PROCESSES } from "@/lib/options";
import { listProfiles, toEngineProfile } from "@/lib/services/leadTimes";
import { STEPS, STEP_LABELS } from "@/lib/timeline";

async function LeadTimes() {
  const member = await requireMember();
  const db = await getDb();
  const [profileRows, vendorRows] = await Promise.all([
    listProfiles(db, member.workspace.id),
    db.select({ id: vendors.id, name: vendors.name, origin: vendors.origin, process: vendors.process }).from(vendors).where(eq(vendors.workspaceId, member.workspace.id)).orderBy(asc(vendors.name)),
  ]);
  const profiles = profileRows.map(toEngineProfile);
  const processes = PROCESSES.map((p) => ({ ...p }));
  const canEdit = can(member.membership.role, "leadTimes.edit");

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Lead times</h1>
        <p className="mt-1.5 max-w-[720px] text-[15px] leading-relaxed text-muted">
          Lead times change with the vendor, where the display is made, and how it is made. Setline starts from your workspace default,
          then applies the narrower profiles that fit a program. Saving a change recalculates every program that uses it.
        </p>
      </div>

      {profileRows.map((row, i) => (
        <section key={row.id} className="rounded-[18px] border border-line bg-surface px-6 py-5">
          {canEdit ? (
            <>
              <ProfileForm profile={{ id: row.id, name: row.name, isDefault: row.isDefault, steps: row.steps }} appliesTo={scopeText(profiles[i], vendorRows, processes)} />
              {!row.isDefault && (
                <form action={deleteProfileAction} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className="h-11 text-[13px] font-semibold text-[#9B1C1C] underline">Delete this profile</button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold">{row.name}</h2>
              <p className="mt-1 text-sm text-muted">Applies to: {scopeText(profiles[i], vendorRows, processes)}</p>
              <p className="mt-2 text-sm">{STEPS.filter((s) => row.steps[s]).map((s) => `${STEP_LABELS[s]} ${row.steps[s]!.days} ${row.steps[s]!.unit} days`).join(" · ")}</p>
            </>
          )}
        </section>
      ))}

      {canEdit && (
        <section className="rounded-[18px] border border-dashed border-control bg-surface px-6 py-5">
          <h2 className="mb-4 font-display text-xl font-bold">Add a profile</h2>
          <NewProfileForm vendors={vendorRows} />
        </section>
      )}

      <LeadTimePlanner profiles={profiles} vendors={vendorRows} processes={processes} />
    </>
  );
}

export default function LeadTimesPage() {
  return (
    <AppShell active="/settings/lead-times">
      <LeadTimes />
    </AppShell>
  );
}
