import { getDb } from "@/lib/db/client";
import { listOpenProgramsForFeed } from "@/lib/services/programs";
import { findWorkspaceByCalendarToken } from "@/lib/services/settings";
import { MILESTONES, MILESTONE_LABELS, addDays } from "@/lib/timeline";

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const day = (date: string) => date.replaceAll("-", "");

/**
 * A calendar feed (.ics) of the key dates still to come on every open program. The long secret in the address
 * is the only credential, because calendar apps cannot sign in; it can be replaced from the integrations page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const db = await getDb();
  const workspace = await findWorkspaceByCalendarToken(db, token.replace(/\.ics$/, ""));
  if (!workspace) return new Response("Not found", { status: 404 });
  const views = await listOpenProgramsForFeed(db, workspace);
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Setline//Key dates//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escape(`Setline: ${workspace.name}`)}`];
  for (const view of views) {
    for (const key of MILESTONES) {
      if (view.completed[key]) continue;
      const date = view.projected[key];
      const late = date > view.planned[key];
      lines.push(
        "BEGIN:VEVENT", `UID:${view.program.id}-${key}@setline`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${day(addDays(date, 1))}`,
        `SUMMARY:${escape(`${view.program.name}: ${MILESTONE_LABELS[key]}`)}`,
        `DESCRIPTION:${escape(`${view.vendor ? `Vendor: ${view.vendor.name}. ` : ""}${late ? `Planned for ${view.planned[key]}, now projected ${date}.` : "On plan."}`)}`,
        "TRANSP:TRANSPARENT", "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900" } });
}
