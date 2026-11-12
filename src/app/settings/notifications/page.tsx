import { AppShell } from "@/components/AppShell";
import { NoticePreferencesForm } from "@/components/SettingsForms";
import { requireMember } from "@/lib/auth/session";
import { emailConfigured } from "@/lib/email";
import { noticeChoicesFor } from "@/lib/services/settings";

async function Notifications() {
  const member = await requireMember();
  const muted = member.membership.mutedNotices;
  const choices = noticeChoicesFor(member.membership.role).map((choice) => ({ type: choice.type, label: choice.label, detail: choice.detail, on: !muted.includes(choice.type) }));
  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1.5 text-[15px] text-muted">Choose which emails Setline sends to {member.user.email}. You are never emailed about something you did yourself.</p>
      </div>
      <section className="max-w-[640px] rounded-[18px] border border-line bg-surface px-6 py-5">
        {choices.length === 0 ? <p className="text-sm text-muted">Your role does not receive notification emails.</p> : <NoticePreferencesForm choices={choices} />}
      </section>
      {!emailConfigured() && <p className="text-[13px] text-muted">Email is not set up on this copy of Setline, so nothing is sent from here.</p>}
    </>
  );
}

export default function NotificationsPage() {
  return (
    <AppShell active="/settings/notifications">
      <Notifications />
    </AppShell>
  );
}
