import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CreateProgramFlow } from "@/components/CreateProgramFlow";
import { can } from "@/lib/auth/permissions";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listProfiles, toEngineProfile } from "@/lib/services/leadTimes";
import { listVendors } from "@/lib/services/vendors";
import { todayInZone } from "@/lib/today";

async function NewProgram() {
  const member = await requireBrandMember();
  if (!can(member.membership.role, "programs.create")) redirect("/programs");
  const db = await getDb();
  const [vendorList, profileRows] = await Promise.all([listVendors(db, member), listProfiles(db, member.workspace.id)]);
  const vendorRows = vendorList.map(({ vendor }) => ({ id: vendor.id, name: vendor.name, origin: vendor.origin, process: vendor.process }));
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div>
        <div className="text-[13px] text-muted"><Link href="/programs" className="inline-block py-3 hover:text-accent-text">Programs</Link> / New program</div>
        <h1 className="font-display text-4xl font-bold tracking-tight">New program</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Five short steps. Setline works out every key date from the in-store date.</p>
      </div>
      <CreateProgramFlow vendors={vendorRows} profiles={profileRows.map(toEngineProfile)} today={todayInZone(member.workspace.timezone)} />
    </div>
  );
}

export default function NewProgramPage() {
  return (
    <AppShell active="/programs">
      <NewProgram />
    </AppShell>
  );
}
