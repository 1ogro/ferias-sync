// Canonical time helpers for edge functions. All "today" / calendar-day
// comparisons must use the America/Sao_Paulo timezone to avoid off-by-one
// bugs when the server runs in UTC (which sits 3h ahead of BRT).

export const SP_TZ = "America/Sao_Paulo";

export interface SPParts {
  iso: string;       // YYYY-MM-DD in SP
  year: number;
  month: number;     // 1..12
  day: number;       // 1..31
  hour: number;      // 0..23
  minute: number;    // 0..59
  dow: number;       // 0=Sun..6=Sat, in SP
}

/** Current wall-clock in America/Sao_Paulo, broken into parts. */
export function nowInSP(now: Date = new Date()): SPParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const year = Number(g("year"));
  const month = Number(g("month"));
  const day = Number(g("day"));
  let hour = Number(g("hour"));
  if (hour === 24) hour = 0; // en-CA quirk
  const minute = Number(g("minute"));
  const wk = g("weekday").toLowerCase();
  const dow = ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as Record<string, number>)[wk] ?? 0;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, year, month, day, hour, minute, dow };
}

/** Alias — today's calendar date in SP. */
export function todayInSP(now: Date = new Date()): SPParts {
  return nowInSP(now);
}

/** Parse a YYYY-MM-DD "civil date" without applying any timezone offset. */
export function parseIsoDateParts(value?: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Parse an override date coming from a request body: "YYYY-MM-DD" → SPParts. */
export function parseOverrideDate(value?: string | null): SPParts | null {
  const p = parseIsoDateParts(value ?? undefined);
  if (!p) return null;
  const iso = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  // dow via UTC midnight of the civil date (safe: exact civil date)
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { iso, year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, dow };
}

/** Shift a civil date by N days, staying in the civil-date domain. */
export function addDaysISO(iso: string, days: number): string {
  const p = parseIsoDateParts(iso);
  if (!p) throw new Error(`invalid iso date: ${iso}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Monday (ISO week start) of the SP week containing `now`, as YYYY-MM-DD. */
export function mondayOfWeekSP(now: Date = new Date()): string {
  const t = nowInSP(now);
  const daysFromMon = (t.dow + 6) % 7; // Sun=6, Mon=0, ...
  return addDaysISO(t.iso, -daysFromMon);
}

/** Convert an SP wall-clock (Y,M,D,h,m) to the equivalent UTC Date instant.
 *  Uses the fixed BRT offset (-03:00) — Brazil has had no DST since 2019.
 */
export function spWallClockToUTC(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  // Compose an ISO string with explicit -03:00 offset; JS parses to correct UTC instant.
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00-03:00`;
  return new Date(iso);
}
