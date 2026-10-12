import "server-only";
import { sha256 } from "../crypto";
import { appUrl } from "../env";
import { SOURCE_LABEL } from "../normalize";
import { fetchWithTimeout } from "../sources/http";
import { addDays, IST } from "../time";
import { accessToken } from "./oauth";

export interface CalendarEventInput {
  eventId: string;
  artist: string;
  venue: string | null;
  city: string;
  startsOn: string;
  startsAt: string | null;
  ticketUrl: string | null;
  earlyBirdDeadline: string | null;
  source: string | null;
}

export type CalendarKind = "show" | "earlybird" | "reminder";

/** Google Calendar ids must be base32hex (a–v, 0–9). Hex is a subset, so a hash keeps inserts idempotent. */
const calId = (eventId: string, kind: CalendarKind) => `eb${sha256(`${eventId}:${kind}`).slice(0, 40)}`;

function describe(e: CalendarEventInput, extra?: string) {
  return [
    extra,
    e.ticketUrl ? `Tickets: ${e.ticketUrl}` : null,
    e.source ? `Found on ${SOURCE_LABEL[e.source] ?? e.source}.` : null,
    `Open in Early Bird: ${appUrl()}/events/${e.eventId}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCalendarBody(e: CalendarEventInput, kind: CalendarKind) {
  const location = [e.venue, e.city].filter(Boolean).join(", ");
  if (kind === "show") {
    const timed = e.startsAt
      ? {
          start: { dateTime: e.startsAt, timeZone: IST },
          end: { dateTime: new Date(Date.parse(e.startsAt) + 3 * 3600_000).toISOString(), timeZone: IST },
        }
      : { start: { date: e.startsOn }, end: { date: addDays(e.startsOn, 1) } };
    return {
      id: calId(e.eventId, kind),
      summary: `${e.artist} live${e.venue ? ` · ${e.venue}` : ` · ${e.city}`}`,
      location,
      description: describe(e),
      ...timed,
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "popup", minutes: 180 }] },
      source: e.ticketUrl ? { title: "Tickets", url: e.ticketUrl } : undefined,
    };
  }
  // Early-bird deadline (or a generic "decide by" reminder a week before the show).
  const end = kind === "earlybird" && e.earlyBirdDeadline ? Date.parse(e.earlyBirdDeadline) : Date.parse(`${addDays(e.startsOn, -7)}T19:00:00+05:30`);
  const start = end - 30 * 60_000;
  return {
    id: calId(e.eventId, kind),
    summary: kind === "earlybird" ? `Early bird ends: ${e.artist} (${e.city})` : `Decide on tickets: ${e.artist} (${e.city})`,
    location,
    description: describe(e, kind === "earlybird" ? "Early-bird pricing closes at the end of this slot." : "Reminder from Early Bird."),
    start: { dateTime: new Date(start).toISOString(), timeZone: IST },
    end: { dateTime: new Date(end).toISOString(), timeZone: IST },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 0 }] },
  };
}

/** Inserts (or finds) the calendar event; returns its htmlLink. A 409 means it already exists. */
export async function upsertCalendarEvent(e: CalendarEventInput, kind: CalendarKind): Promise<string> {
  const token = await accessToken();
  const body = buildCalendarBody(e, kind);
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const res = await fetchWithTimeout(`${base}?sendUpdates=none`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const got = await fetchWithTimeout(`${base}/${body.id}`, { headers: { authorization: `Bearer ${token}` } });
    const j = (await got.json()) as { htmlLink?: string; status?: string };
    if (j.status === "cancelled") {
      // Previously deleted by the user: restore it.
      await fetchWithTimeout(`${base}/${body.id}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, status: "confirmed" }),
      });
    }
    return j.htmlLink ?? "https://calendar.google.com";
  }
  const j = (await res.json()) as { htmlLink?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Calendar: ${j.error?.message ?? res.status}`);
  return j.htmlLink ?? "https://calendar.google.com";
}

const gcalStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** No-API fallback: a prefilled "Add to Google Calendar" link. Works without any connection. */
export function calendarTemplateUrl(e: CalendarEventInput): string {
  const dates = e.startsAt
    ? `${gcalStamp(e.startsAt)}/${gcalStamp(new Date(Date.parse(e.startsAt) + 3 * 3600_000).toISOString())}`
    : `${e.startsOn.replace(/-/g, "")}/${addDays(e.startsOn, 1).replace(/-/g, "")}`;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${e.artist} live${e.venue ? ` · ${e.venue}` : ""}`,
    dates,
    details: describe(e),
    location: [e.venue, e.city].filter(Boolean).join(", "),
    ctz: IST,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
