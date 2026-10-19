import type { ISODate } from "../model/types";

/** UTC-only date helpers on "YYYY-MM-DD" strings (deterministic, no TZ drift). */

export function parseISO(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds calendar months, clamping the day (31/01 + 1 month = 28/02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = parseISO(date);
  const day = d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return toISO(new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month)))));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

/** Whole months from `from` to `to` (can be negative). Partial months round down. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/** Months left until `to`, at least 0, counting a started month as one. */
export function monthsLeft(today: ISODate, to: ISODate): number {
  const days = daysBetween(today, to);
  if (days <= 0) return 0;
  return Math.max(1, Math.ceil(days / 30.4375));
}

export function dayOfMonth(date: ISODate): number {
  return parseISO(date).getUTCDate();
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function isOnOrAfter(a: ISODate, b: ISODate): boolean {
  return a >= b;
}

/** Next date (strictly after `after`, or equal when `inclusive`) that falls on `day` of a month. */
export function nextDayOfMonth(after: ISODate, day: number, inclusive = false): ISODate {
  const d = parseISO(after);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const clamp = (y: number, m: number) => Math.min(day, daysInMonth(y, m));
  const candidate = toISO(new Date(Date.UTC(year, month, clamp(year, month))));
  if (inclusive ? candidate >= after : candidate > after) return candidate;
  const next = new Date(Date.UTC(year, month + 1, 1));
  return toISO(new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), clamp(next.getUTCFullYear(), next.getUTCMonth()))));
}

/** "dd/MM/yyyy" for display. */
export function formatISODate(date: ISODate | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "MM/yyyy" for display. */
export function formatISOMonth(date: ISODate | undefined): string {
  if (!date) return "—";
  const [y, m] = date.split("-");
  return `${m}/${y}`;
}

/** "1 năm 3 tháng" style duration. */
export function formatMonths(months: number): string {
  if (months <= 0) return "0 tháng";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} tháng`;
  return rest ? `${years} năm ${rest} tháng` : `${years} năm`;
}
