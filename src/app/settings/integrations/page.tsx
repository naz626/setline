import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { requireBrandMember } from "@/lib/auth/session";
import { HEALTH_STYLES } from "@/lib/status";

const CARD = "rounded-[18px] border border-line bg-surface px-6 py-5";
const READY = { ...HEALTH_STYLES.onTrack, label: "Ready to use" };
const PLANNED = { ...HEALTH_STYLES.notStarted, label: "Not built yet" };

const PLANNED_CONNECTIONS = [
  { name: "Esko WebCenter", what: "Bring proof versions and approval status in from WebCenter, so nobody enters them twice.", note: "Esko gives API access to partners, so this starts once access is confirmed." },
  { name: "PageProof", what: "Sync proof status and decisions." },
  { name: "Asana, Smartsheet and monday.com", what: "Import programs and keep key dates in step." },
  { name: "Slack and Microsoft Teams", what: "Alerts when a program becomes at risk or a vendor reports a backlog." },
  { name: "Google Drive, Dropbox and OneDrive", what: "Pick artwork, proofs and guidelines straight from your file storage." },
  { name: "Ship notices and carrier tracking", what: "Fill in shipped and delivered dates per store from EDI 856 notices and tracking numbers." },
];

async function Integrations() {
  await requireBrandMember();
  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1.5 text-[15px] text-muted">What Setline can take in today, and the connections that are planned.</p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="ready">
        <h2 id="ready" className="font-display text-2xl font-bold tracking-tight">Working today</h2>
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
            <p className="mt-1 text-sm text-muted">Proofs and guidelines are saved as https links, so files can stay in Esko, Drive, Dropbox or wherever they live now.</p>
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
