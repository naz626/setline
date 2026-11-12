import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { removeCalendarLinkAction } from "@/app/actions";
import { AlertWebhookForm, CalendarLinkForm, ImportProgramsForm } from "@/components/SettingsForms";
import { can } from "@/lib/auth/permissions";
import { requireBrandMember } from "@/lib/auth/session";
import { DISPLAY_TYPES } from "@/lib/options";
import { uploadsConfigured } from "@/lib/uploads";
import { HEALTH_STYLES } from "@/lib/status";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const READY = { ...HEALTH_STYLES.onTrack, label: "Ready to use" };
const PLANNED = { ...HEALTH_STYLES.notStarted, label: "Not built yet" };
const CONNECTED = { ...HEALTH_STYLES.onTrack, label: "Connected" };
const OFF = { ...HEALTH_STYLES.notStarted, label: "Not connected" };

const PLANNED_CONNECTIONS = [
  { name: "Esko WebCenter", what: "Bring proof versions and approval status in from WebCenter, so nobody enters them twice.", note: "Esko gives API access to partners, so this starts once access is confirmed." },
  { name: "PageProof", what: "Sync proof status and decisions." },
  { name: "Asana, Smartsheet and monday.com", what: "Keep programs and key dates in step automatically. Until then, paste rows from any of them above." },
  { name: "Google Drive, Dropbox and OneDrive", what: "Pick artwork, proofs and guidelines straight from your file storage." },
  { name: "Ship notices and carrier tracking", what: "Fill in shipped and delivered dates per store from EDI 856 notices and tracking numbers." },
];

async function Integrations() {
  const member = await requireBrandMember();
  const canManage = can(member.membership.role, "integrations.manage");
  const canImport = can(member.membership.role, "programs.create");
  const { alertWebhookUrl, calendarTokenHash } = member.workspace;
  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1.5 text-[15px] text-muted">What Setline connects to today, and what is planned.</p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="ready">
        <h2 id="ready" className="font-display text-2xl font-bold tracking-tight">Working today</h2>

        <article className={`${CARD} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-[1_1_320px]">
              <h3 className="font-display text-xl font-bold">Slack and Microsoft Teams alerts</h3>
              <p className="mt-1 text-sm text-muted">Posts to one channel when a vendor sets a status, a proof is sent or decided, a program is submitted, or a change is logged. Create an incoming webhook in Slack or Teams and paste its address here.</p>
            </div>
            <StatusPill style={alertWebhookUrl ? CONNECTED : OFF} />
          </div>
          {canManage ? <AlertWebhookForm connected={Boolean(alertWebhookUrl)} /> : <p className="text-[13px] text-muted">A workspace admin can connect this.</p>}
        </article>

        <article className={`${CARD} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-[1_1_320px]">
              <h3 className="font-display text-xl font-bold">Calendar feed</h3>
              <p className="mt-1 text-sm text-muted">Subscribe in Google Calendar, Outlook or Apple Calendar to see every key date still to come. Anyone with the address can read the dates, so share it only with your team. Replacing it turns the old address off.</p>
            </div>
            <StatusPill style={calendarTokenHash ? { ...CONNECTED, label: "Address created" } : OFF} />
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-start gap-3">
              <CalendarLinkForm exists={Boolean(calendarTokenHash)} />
              {calendarTokenHash && (
                <form action={removeCalendarLinkAction}>
                  <button type="submit" className="h-12 rounded-xl border-[1.5px] border-control px-5 text-sm font-semibold text-muted">Turn the feed off</button>
                </form>
              )}
            </div>
          ) : <p className="text-[13px] text-muted">A workspace admin can create the address.</p>}
        </article>

        <article className={`${CARD} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-[1_1_320px]">
              <h3 className="font-display text-xl font-bold">Import programs from a spreadsheet</h3>
              <p className="mt-1 text-sm text-muted">Copy rows from Excel, Google Sheets, Smartsheet or an export from another tool. One program per row, in this order: name, retailer, display type, in-store date (2027-03-15), vendor, store count. The last two are optional. Display types: {DISPLAY_TYPES.join(", ")}.</p>
            </div>
            <StatusPill style={READY} />
          </div>
          {canImport ? <ImportProgramsForm /> : <p className="text-[13px] text-muted">Admins and program managers can import programs.</p>}
        </article>

        <article className={`${CARD} flex flex-wrap items-start justify-between gap-3`}>
          <div className="flex-[1_1_320px]">
            <h3 className="font-display text-xl font-bold">File uploads</h3>
            <p className="mt-1 text-sm text-muted">Upload proofs, artwork, guidelines and install photos up to 25 MB each. Files are private and only open for people who can see the program.</p>
          </div>
          <StatusPill style={uploadsConfigured() ? READY : { ...OFF, label: "Not set up here" }} />
        </article>
        <article className={`${CARD} flex flex-wrap items-start justify-between gap-3`}>
          <div className="flex-[1_1_320px]">
            <h3 className="font-display text-xl font-bold">Paste a store list</h3>
            <p className="mt-1 text-sm text-muted">Copy store numbers and locations from a spreadsheet and paste them into a program&rsquo;s store rollout. Open a program from <Link href="/programs" className="font-semibold text-ink underline">Programs</Link>, then choose Store rollout.</p>
          </div>
          <StatusPill style={READY} />
        </article>
        <article className={`${CARD} flex flex-wrap items-start justify-between gap-3`}>
          <div className="flex-[1_1_320px]">
            <h3 className="font-display text-xl font-bold">Links to files anywhere</h3>
            <p className="mt-1 text-sm text-muted">Anything can also be added as an https link, so files can stay in Esko, Drive, Dropbox or wherever they live now.</p>
          </div>
          <StatusPill style={READY} />
        </article>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="planned">
        <h2 id="planned" className="font-display text-2xl font-bold tracking-tight">Planned</h2>
        <p className="-mt-2 text-sm text-muted">None of these connect yet. They are listed so you can see what is coming.</p>
        {PLANNED_CONNECTIONS.map((item) => (
          <article key={item.name} className={`${CARD} flex flex-wrap items-start justify-between gap-3`}>
            <div className="flex-[1_1_320px]">
              <h3 className="font-display text-xl font-bold">{item.name}</h3>
              <p className="mt-1 text-sm text-muted">{item.what}</p>
              {item.note && <p className="mt-1 text-[13px] text-muted">{item.note}</p>}
            </div>
            <StatusPill style={PLANNED} />
          </article>
        ))}
      </section>
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <AppShell active="/settings/integrations">
      <Integrations />
    </AppShell>
  );
}
