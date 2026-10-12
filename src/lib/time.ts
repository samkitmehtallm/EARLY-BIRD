/** All display and "today" logic runs in India Standard Time (UTC+05:30, no DST). */
export const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;

/** yyyy-mm-dd for the given instant, in IST. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Combine an IST calendar date and an HH:MM time into a UTC ISO instant. */
export function istToUtcIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  const utc = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) - IST_OFFSET_MS;
  return new Date(utc).toISOString();
}

/** Accepts ISO strings, "2026-11-14", "14 Nov 2026" and similar; returns yyyy-mm-dd or null. */
export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
  }
  const t = Date.parse(s);
  if (isNaN(t)) return null;
  return istDate(new Date(t));
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts });

export function formatDay(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00+05:30`);
  return {
    day: fmt({ day: "numeric" }).format(d),
    month: fmt({ month: "short" }).format(d).toUpperCase(),
    weekday: fmt({ weekday: "short" }).format(d),
    long: fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d),
    monthYear: fmt({ month: "long", year: "numeric" }).format(d),
  };
}

export function formatDateTime(iso: string) {
  return fmt({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

export function formatTime(iso: string) {
  return fmt({ hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

/** "2d 14h", "5h 12m", "18m", or null once passed. */
export function countdown(targetIso: string, now = Date.now()): string | null {
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function hoursUntil(iso: string, now = Date.now()) {
  return (new Date(iso).getTime() - now) / 3_600_000;
}
