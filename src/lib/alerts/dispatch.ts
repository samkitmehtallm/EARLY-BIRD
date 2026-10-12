import "server-only";
import { signToken } from "../crypto";
import { db, must } from "../db";
import { appUrl, env } from "../env";
import type { Settings } from "../types";
import { renderEmail, subjectFor, type AlertItem } from "./email";
import { sendEmail } from "./send";

const MAX_ATTEMPTS = 4;

export const decideUrl = (eventId: string) => `${appUrl()}/d?t=${signToken({ e: eventId }, 60 * 60 * 24 * 60)}`;

/**
 * Sends every pending alert as one digest email (Bengaluru first). Rows stay pending on
 * failure and retry next run; with no email channel they are kept as in-app alerts.
 */
export async function dispatchAlerts(): Promise<{ sent: number; message?: string }> {
  const supa = db();
  const rows = must(
    await supa
      .from("alerts")
      .select("id,kind,urgent,summary,attempts,event:events!inner(id,venue,city,starts_on,starts_at,ticket_url,price_min_inr,early_bird_status,early_bird_deadline,scarcity_signals,is_bengaluru,best_source,first_seen_at,decision,artist:artists!inner(name,image_url))")
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at")
      .limit(30),
    "load pending alerts",
  ) as unknown as (AlertItem["alert"] & { attempts: number; event: AlertItem["event"] & { decision: string; artist: AlertItem["artist"] } })[];

  if (!rows.length) return { sent: 0 };

  const skipped = rows.filter((r) => r.event.decision === "skip").map((r) => r.id);
  if (skipped.length) await supa.from("alerts").update({ status: "in_app", channel: "muted" }).in("id", skipped);
  const live = rows.filter((r) => r.event.decision !== "skip");
  if (!live.length) return { sent: 0 };

  const settings = must(await supa.from("settings").select("*").eq("id", 1).single(), "load settings") as Settings;
  const to = settings.alert_email ?? env.alertEmailTo ?? settings.google_email;
  const ids = live.map((r) => r.id);

  if (!to) {
    await supa.from("alerts").update({ status: "in_app", channel: "in_app" }).in("id", ids);
    return { sent: 0, message: `${ids.length} alert${ids.length === 1 ? "" : "s"} saved in the app — add an alert email in Settings to receive them.` };
  }

  const items: AlertItem[] = live.map((r) => ({
    alert: { id: r.id, kind: r.kind, urgent: r.urgent, summary: r.summary },
    event: r.event,
    artist: r.event.artist,
    decideUrl: decideUrl(r.event.id),
  }));
  const { html, text } = renderEmail(items, appUrl());

  try {
    const res = await sendEmail({ to, subject: subjectFor(items), html, text }, settings.google_email);
    await supa
      .from("alerts")
      .update({ status: "sent", channel: res.channel, provider_message_id: res.id, sent_at: new Date().toISOString(), error: null })
      .in("id", ids);
    return { sent: ids.length, message: `Emailed ${ids.length} alert${ids.length === 1 ? "" : "s"} to ${to}.` };
  } catch (e) {
    const err = e as Error & { noChannel?: boolean };
    if (err.noChannel) {
      await supa.from("alerts").update({ status: "in_app", channel: "in_app" }).in("id", ids);
      return { sent: 0, message: `${ids.length} alert${ids.length === 1 ? "" : "s"} saved in the app — connect Google in Settings to get them by email.` };
    }
    for (const r of live) {
      await supa
        .from("alerts")
        .update({ attempts: r.attempts + 1, error: err.message.slice(0, 300), status: r.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending" })
        .eq("id", r.id);
    }
    throw err;
  }
}

/** Queues a "closing soon" alert for open early-bird windows that end within 24 hours. */
export async function sweepDeadlines(runId: string): Promise<number> {
  const supa = db();
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const events = must(
    await supa
      .from("events")
      .select("id,early_bird_deadline,city,artist:artists!inner(name)")
      .eq("status", "active")
      .eq("needs_review", false)
      .neq("decision", "skip")
      .in("early_bird_status", ["available", "upcoming"])
      .gt("early_bird_deadline", now.toISOString())
      .lte("early_bird_deadline", soon.toISOString()),
    "deadline sweep",
  ) as unknown as { id: string; early_bird_deadline: string; city: string; artist: { name: string } }[];
  if (!events.length) return 0;
  const res = await supa
    .from("alerts")
    .upsert(
      events.map((e) => ({
        event_id: e.id,
        kind: "deadline_soon",
        dedupe_key: `${e.id}:deadline:${e.early_bird_deadline}`,
        summary: `Early bird closes within 24h: ${e.artist.name} · ${e.city}`,
        urgent: true,
        run_id: runId,
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  return res.data?.length ?? 0;
}
