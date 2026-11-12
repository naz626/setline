import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { NewProgramForm } from "@/components/ProgramForms";
import { can } from "@/lib/auth/permissions";
import { requireMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { vendors } from "@/lib/db/schema";

async function NewProgram() {
  const member = await requireMember();
  if (!can(member.membership.role, "programs.create")) redirect("/programs");
  const db = await getDb();
  const vendorRows = await db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.workspaceId, member.workspace.id)).orderBy(asc(vendors.name));
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div>
        <div className="text-[13px] text-muted"><Link href="/programs" className="inline-block py-3 hover:text-accent-text">Programs</Link> / New program</div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Start with the in-store date</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Tell us what you are making and when it has to be in store. Setline works out every other date from there.</p>
      </div>
      <NewProgramForm vendors={vendorRows} />
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
