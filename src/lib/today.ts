import type { ISODate } from "@/lib/timeline";

/** The calendar date right now in the given IANA time zone, so deadlines turn over at the workspace's midnight. */
export function todayInZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A moment shown as a short date in the workspace's time zone, for history and comments. */
export function formatStamp(moment: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(moment);
  } catch {
    return moment.toISOString().slice(0, 16).replace("T", " ");
  }
}
