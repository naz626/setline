import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { requireBrandMember } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listProgramViews } from "@/lib/services/programs";
import type { ProgramView } from "@/lib/services/programs";
import { HEALTH_STYLES, VENDOR_STYLES } from "@/lib/status";
import { MILESTONES, MILESTONE_LABELS, addDays, daysBetween, formatShort, toUTC } from "@/lib/timeline";
import type { ISODate } from "@/lib/timeline";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** The first day of each month inside the window, for the scale along the top. */
function monthStarts(start: ISODate, end: ISODate): ISODate[] {
  const months: ISODate[] = [];
  let [year, month] = start.split("-").map(Number);
  for (;;) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    if (first > end) return months;
    months.push(first);
  }
}

function Row({ view, percent }: { view: ProgramView; percent: (date: ISODate) => number }) {
  const { program, planned, projected, completed, next, health, vendorState, today } = view;
  const style = HEALTH_STYLES[health];
  const late = projected.inStore > planned.inStore;
  return (
    <li className="grid gap-x-5 gap-y-2 border-b border-line py-4 last:border-b-0 lg:grid-cols-[260px_1fr] lg:items-center">
      <div className="flex flex-col items-start gap-1.5">
        <Link href={`/programs/${program.id}`} className="inline-block py-1.5 text-[15px] font-semibold hover:text-accent-text">{program.name}</Link>
        <div className="flex flex-wrap gap-2">
          <StatusPill style={style} />
          {vendorState && <StatusPill style={VENDOR_STYLES[vendorState]} />}
        </div>
      </div>
      <div className="min-w-0">
        <div className="relative h-7" aria-hidden="true">
          {MILESTONES.slice(1).map((key, i) => {
            const from = percent(planned[MILESTONES[i]]);
            const width = Math.max(percent(planned[key]) - from, 0.6);
            const done = Boolean(completed[key]);
            return (
              <span key={key} className="absolute top-2 h-3 rounded-full" title={`${MILESTONE_LABELS[key]}: ${formatShort(planned[key])}`}
                style={{ left: `${from}%`, width: `calc(${width}% - 2px)`, background: done ? style.dot : key === next ? style.tint : "var(--color-line)", border: key === next ? `2px solid ${style.dot}` : undefined }} />
            );
          })}
          {late && (
            <span className="absolute top-2 h-3 rounded-full border-2 border-dashed" title={`Projected in store ${formatShort(projected.inStore)}`}
              style={{ left: `${percent(planned.inStore)}%`, width: `${percent(projected.inStore) - percent(planned.inStore)}%`, borderColor: HEALTH_STYLES.willMiss.dot, background: HEALTH_STYLES.willMiss.tint }} />
          )}
          <span className="absolute top-0 h-7 w-0.5 bg-ink" style={{ left: `${percent(today)}%` }} />
          <span className="absolute top-1 h-5 w-5 -translate-x-1/2 rotate-45 rounded-[3px] bg-ink" style={{ left: `${percent(planned.inStore)}%` }} />
        </div>
        <p className="mt-1.5 text-[13px] text-muted">
          {next ? <>Next: <span className="font-semibold text-ink">{MILESTONE_LABELS[next]}</span>, {planned[next] < today ? `was due ${formatShort(planned[next])}` : `due ${formatShort(planned[next])}`} · </> : null}
          In store <span className="font-semibold text-ink">{formatShort(planned.inStore)}</span>
          {late && <span className="font-semibold" style={{ color: HEALTH_STYLES.willMiss.text }}> · now projected {formatShort(projected.inStore)}, {daysBetween(planned.inStore, projected.inStore)} days late</span>}
        </p>
      </div>
    </li>
  );
}

async function Timeline() {
  const member = await requireBrandMember();
  const views = (await listProgramViews(await getDb(), member))
    .filter((v) => v.health !== "complete")
    .sort((a, b) => a.program.inStoreDate.localeCompare(b.program.inStoreDate));

  if (views.length === 0) {
    return (
      <>
        <h1 className="font-display text-4xl font-bold tracking-tight">Timeline</h1>
        <section className="rounded-[18px] border border-dashed border-control bg-surface p-8">
          <h2 className="font-display text-xl font-bold">Nothing on the timeline</h2>
          <p className="mt-2 text-sm text-muted">Open programs appear here, each drawn back from its in-store date.</p>
        </section>
      </>
    );
  }

  const today = views[0].today;
  const dates = views.flatMap((v) => [v.planned.submit, v.planned.inStore, v.projected.inStore]).concat(today).sort();
  const start = addDays(dates[0], -5);
  const end = addDays(dates[dates.length - 1], 7);
  const total = daysBetween(start, end);
  const percent = (date: ISODate) => Math.min(100, Math.max(0, (daysBetween(start, date) / total) * 100));
  const late = views.filter((v) => v.projected.inStore > v.planned.inStore);

  return (
    <>
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Timeline</h1>
        <p className="mt-1.5 text-[15px] text-muted">Every open program, counted back from its in-store date.</p>
      </div>

      {late.length > 0 && (
        <section className="rounded-[18px] p-6" style={{ background: HEALTH_STYLES.willMiss.tint }}>
          <h2 className="font-display text-[22px] font-bold">{late.length} {late.length === 1 ? "program is" : "programs are"} projected to miss the in-store date</h2>
          <ul className="mt-2 text-sm leading-relaxed">
            {late.map((v) => (
              <li key={v.program.id}>
                <Link href={`/programs/${v.program.id}`} className="inline-block py-1.5 font-semibold underline">{v.program.name}</Link>: {formatShort(v.planned.inStore)} becomes {formatShort(v.projected.inStore)}. Open it to move the date or change the vendor.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[18px] border border-line bg-surface px-6 py-5">
        <div className="hidden gap-x-5 lg:grid lg:grid-cols-[260px_1fr]" aria-hidden="true">
          <span />
          <div className="relative h-6 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {monthStarts(start, end).map((first) => (
              <span key={first} className="absolute border-l border-line pl-1.5" style={{ left: `${percent(first)}%` }}>{MONTH.format(new Date(toUTC(first)))}</span>
            ))}
          </div>
        </div>
        <ul>
          {views.map((view) => <Row key={view.program.id} view={view} percent={percent} />)}
        </ul>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted" aria-label="How to read the chart">
          <li className="flex items-center gap-2"><span className="h-3 w-6 rounded-full bg-ink/70" aria-hidden="true" />Done</li>
          <li className="flex items-center gap-2"><span className="h-3 w-6 rounded-full border-2 border-ink" aria-hidden="true" />In progress</li>
          <li className="flex items-center gap-2"><span className="h-3 w-6 rounded-full bg-line" aria-hidden="true" />Still to come</li>
          <li className="flex items-center gap-2"><span className="h-4 w-0.5 bg-ink" aria-hidden="true" />Today, {formatShort(today)}</li>
          <li className="flex items-center gap-2"><span className="h-3 w-3 rotate-45 rounded-[2px] bg-ink" aria-hidden="true" />In-store date</li>
          <li className="flex items-center gap-2"><span className="h-3 w-6 rounded-full border-2 border-dashed" style={{ borderColor: HEALTH_STYLES.willMiss.dot }} aria-hidden="true" />Projected delay</li>
        </ul>
      </section>
    </>
  );
}

export default function TimelinePage() {
  return (
    <AppShell active="/timeline">
      <Timeline />
    </AppShell>
  );
}
