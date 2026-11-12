import type { ISODate } from "@/lib/timeline";

/** The calendar date right now in the given IANA time zone, so deadlines turn over at the workspace's midnight. */
export function todayInZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
