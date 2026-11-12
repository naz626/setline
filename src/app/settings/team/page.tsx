import { asc, eq } from "drizzle-orm";
import { revokeInviteAction } from "@/app/actions";
import { AppShell } from "@/components/AppShell";
import { InviteForm } from "@/components/TeamForms";
import { ROLE_LABELS, ROLE_SUMMARY, can } from "@/lib/auth/permissions";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { vendors } from "@/lib/db/schema";
import { listMembers, listPendingInvitations } from "@/lib/services/team";

async function Team() {
  const member = await requireBrandMember();
  const db = await getDb();
  const canInvite = can(member.membership.role, "members.invite");
  const [members, invitations, vendorRows] = await Promise.all([
    listMembers(db, member),
    canInvite ? listPendingInvitations(db, member) : [],
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.workspaceId, member.workspace.id)).orderBy(asc(vendors.name)),
  ]);

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Team</h1>
        <p className="mt-1.5 text-[15px] text-muted">Invite the people who collaborate, review or just need to see.</p>
      </div>

      {canInvite && (
        <section className="rounded-[18px] border border-line bg-surface px-6 py-5">
          <InviteForm vendors={vendorRows} />
        </section>
      )}

      <section className="rounded-[18px] border border-line bg-surface px-6 py-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
                <th className="pb-2.5 font-semibold">Member</th>
                <th className="pb-2.5 font-semibold">Role</th>
                <th className="pb-2.5 font-semibold">Can</th>
                <th className="pb-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-b-0">
                  <td className="py-3.5 pr-4 font-semibold">{m.email}{m.userId === member.user.id && " (you)"}</td>
                  <td className="py-3.5 pr-4">{ROLE_LABELS[m.role]}{m.vendorName && ` · ${m.vendorName}`}</td>
                  <td className="py-3.5 pr-4 text-[13px] text-muted">{ROLE_SUMMARY[m.role]}</td>
                  <td className="py-3.5 text-[13px] font-semibold text-[#14633F]">Active</td>
                </tr>
              ))}
              {invitations.map((invite) => (
                <tr key={invite.id} className="border-b border-line last:border-b-0">
                  <td className="py-3.5 pr-4 font-semibold">{invite.email}</td>
                  <td className="py-3.5 pr-4">{ROLE_LABELS[invite.role]}{invite.vendorName && ` · ${invite.vendorName}`}</td>
                  <td className="py-3.5 pr-4 text-[13px] text-muted">{ROLE_SUMMARY[invite.role]}</td>
                  <td className="py-3.5">
                    <form action={revokeInviteAction} className="flex items-center gap-3">
                      <span className="text-[13px] font-semibold text-[#7A4B00]">Invited</span>
                      <input type="hidden" name="id" value={invite.id} />
                      <button type="submit" className="h-11 text-[13px] font-semibold underline">Cancel<span className="sr-only"> invitation for {invite.email}</span></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function TeamPage() {
  return (
    <AppShell active="/settings/team">
      <Team />
    </AppShell>
  );
}
