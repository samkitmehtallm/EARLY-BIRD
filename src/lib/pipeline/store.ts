import "server-only";
import { db, must } from "../db";
import { istDate } from "../time";
import type { Candidate, EventRow } from "../types";
import { dedupeBatch, planMerge } from "./merge";

export interface StoreResult {
  inserted: number;
  changed: number;
  alerts: number;
}

/**
 * Applies candidates to the database: insert or merge, record history, link sources,
 * and queue alerts. Alert rows are unique on dedupe_key, so a retry never double-alerts.
 */
export async function storeCandidates(cands: Candidate[], runId: string): Promise<StoreResult> {
  const out: StoreResult = { inserted: 0, changed: 0, alerts: 0 };
  const supa = db();

  for (const c of dedupeBatch(cands)) {
    const key = `${c.artistSlug}|${c.citySlug}|${c.date}`;
    let existing = must(await supa.from("events").select("*").eq("event_key", key).maybeSingle(), "load event") as EventRow | null;

    // Reschedule: same artist, same city, same ticket link, different date → move the existing row.
    let rescheduledFrom: string | null = null;
    if (!existing && c.ticketUrl) {
      const moved = must(
        await supa
          .from("events")
          .select("*")
          .eq("artist_id", c.artistId)
          .eq("city_slug", c.citySlug)
          .eq("ticket_url", c.ticketUrl)
          .gte("starts_on", istDate())
          .neq("starts_on", c.date)
          .limit(1),
        "reschedule check",
      ) as EventRow[];
      if (moved[0]) {
        existing = moved[0];
        rescheduledFrom = moved[0].starts_on;
      }
    }

    const plan = planMerge(existing, c);
    const now = new Date().toISOString();
    let eventId: string;

    if (plan.isNew) {
      const ins = must(
        await supa
          .from("events")
          .insert({ ...plan.row, first_seen_run_id: runId, first_seen_at: now, last_seen_at: now, last_changed_at: now })
          .select("id")
          .single(),
        "insert event",
      ) as { id: string };
      eventId = ins.id;
      out.inserted++;
    } else {
      eventId = existing!.id;
      const patch: Partial<EventRow> = { ...plan.row, last_seen_at: now };
      if (rescheduledFrom) {
        patch.event_key = plan.key;
        patch.starts_on = c.date;
        plan.changes.push({ field: "starts_on", old: rescheduledFrom, new: c.date });
        plan.alerts.push({
          kind: "changed",
          dedupeSuffix: `date:${c.date}`,
          urgent: false,
          summary: `Date moved: ${c.artistName} · ${c.city} is now on ${c.date} (was ${rescheduledFrom})`,
        });
      }
      if (plan.changes.length) patch.last_changed_at = now;
      must(await supa.from("events").update(patch).eq("id", eventId), "update event");
      if (plan.changes.length) out.changed++;
    }

    if (plan.changes.length) {
      must(
        await supa.from("event_changes").insert(
          plan.changes.map((ch) => ({ event_id: eventId, field: ch.field, old_value: ch.old ?? null, new_value: ch.new ?? null, run_id: runId })),
        ),
        "record changes",
      );
    }

    must(
      await supa
        .from("event_sources")
        .upsert({ event_id: eventId, source: c.source, url: c.sourceUrl, last_seen_at: now }, { onConflict: "event_id,source,url" }),
      "link source",
    );
    if (c.ticketUrl && c.ticketUrl !== c.sourceUrl) {
      await supa
        .from("event_sources")
        .upsert({ event_id: eventId, source: c.source, url: c.ticketUrl, last_seen_at: now }, { onConflict: "event_id,source,url" });
    }

    if (plan.alerts.length) {
      const res = await supa
        .from("alerts")
        .upsert(
          plan.alerts.map((a) => ({
            event_id: eventId,
            kind: a.kind,
            dedupe_key: `${eventId}:${a.dedupeSuffix}`,
            summary: a.summary,
            urgent: a.urgent,
            run_id: runId,
          })),
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      out.alerts += res.data?.length ?? 0;
    }
  }
  return out;
}
