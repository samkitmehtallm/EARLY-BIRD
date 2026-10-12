import "server-only";
import { db, must } from "./db";
import { NotConfiguredError } from "./env";
import { calendarTemplateUrl, upsertCalendarEvent, type CalendarEventInput } from "./google/calendar";
import { isGoogleConnected } from "./google/oauth";
import type { Decision, EventRow } from "./types";

export interface DecisionResult {
  ok: boolean;
  decision: Decision;
  message: string;
  /** Links into Google Calendar for events we created. */
  calendarLinks: Record<string, string>;
  /** When Google is not connected: a prefilled "add to calendar" link the user can open. */
  templateUrl?: string;
}

/**
 * Records Karan's decision and turns it into calendar entries:
 *  going → the show itself + an early-bird deadline reminder (if a window is open)
 *  maybe → only a reminder (early-bird deadline, or a week before the show)
 *  skip  → hide the show and mute its alerts
 */
export async function decide(eventId: string, decision: Decision): Promise<DecisionResult> {
  const supa = db();
  const ev = must(
    await supa.from("events").select("*, artist:artists!inner(name)").eq("id", eventId).single(),
    "load event",
  ) as EventRow & { artist: { name: string } };

  const input: CalendarEventInput = {
    eventId: ev.id,
    artist: ev.artist.name,
    venue: ev.venue,
    city: ev.city,
    startsOn: ev.starts_on,
    startsAt: ev.starts_at,
    ticketUrl: ev.ticket_url,
    earlyBirdDeadline: ev.early_bird_deadline,
    source: ev.best_source,
  };

  const links: Record<string, string> = { ...(ev.calendar_links ?? {}) };
  let message = "";
  let templateUrl: string | undefined;
  const deadlineAhead = ev.early_bird_deadline && Date.parse(ev.early_bird_deadline) > Date.now() + 45 * 60_000;

  if (decision === "going" || decision === "maybe") {
    const wanted: ("show" | "earlybird" | "reminder")[] =
      decision === "going" ? (deadlineAhead ? ["show", "earlybird"] : ["show"]) : [deadlineAhead ? "earlybird" : "reminder"];
    if (await isGoogleConnected()) {
      try {
        for (const kind of wanted) links[kind] = await upsertCalendarEvent(input, kind);
        message =
          decision === "going"
            ? `Added to your Google Calendar${wanted.includes("earlybird") ? ", with a reminder before early bird ends" : ""}.`
            : "Reminder added to your Google Calendar.";
      } catch (e) {
        if (e instanceof NotConfiguredError) {
          templateUrl = calendarTemplateUrl(input);
          message = e.message;
        } else {
          throw e;
        }
      }
    } else {
      templateUrl = calendarTemplateUrl(input);
      message = "Saved. Google isn't connected, so we opened a prefilled calendar event for you.";
    }
  } else if (decision === "skip") {
    message = "Hidden. You won't get more alerts for this show.";
  } else {
    message = "Decision cleared.";
  }

  must(
    await supa
      .from("events")
      .update({ decision, decided_at: decision === "undecided" ? null : new Date().toISOString(), calendar_links: links })
      .eq("id", eventId),
    "save decision",
  );
  return { ok: true, decision, message, calendarLinks: links, templateUrl };
}
