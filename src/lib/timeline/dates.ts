/** Calendar dates as ISO strings (YYYY-MM-DD). All math is done in UTC so results never shift with the server's time zone. */
export type ISODate = string;

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(time: number): ISODate {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

export function dayOfWeek(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export type Holidays = ReadonlySet<ISODate>;

export function isWorkingDay(date: ISODate, holidays?: Holidays): boolean {
  const dow = dayOfWeek(date);
  return dow !== 0 && dow !== 6 && !holidays?.has(date);
}

/** Moves forward (positive) or backward (negative) by a number of working days. */
export function addWorkingDays(date: ISODate, days: number, holidays?: Holidays): ISODate {
  const step = days >= 0 ? 1 : -1;
  let left = Math.abs(days);
  let current = date;
  while (left > 0) {
    current = addDays(current, step);
    if (isWorkingDay(current, holidays)) left--;
  }
  return current;
}

/** If the date is not a working day, moves it to the nearest working day in the given direction. */
export function snapToWorkingDay(date: ISODate, direction: -1 | 1, holidays?: Holidays): ISODate {
  let current = date;
  while (!isWorkingDay(current, holidays)) current = addDays(current, direction);
  return current;
}

/** Working days after `from` up to and including `to`. Negative when `to` is before `from`. */
export function workingDaysBetween(from: ISODate, to: ISODate, holidays?: Holidays): number {
  if (from === to) return 0;
  const forward = from < to;
  let current = forward ? from : to;
  const end = forward ? to : from;
  let count = 0;
  while (current < end) {
    current = addDays(current, 1);
    if (isWorkingDay(current, holidays)) count++;
  }
  return forward ? count : -count;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function formatShort(date: ISODate): string {
  const d = new Date(toUTC(date));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatLong(date: ISODate): string {
  const d = new Date(toUTC(date));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
