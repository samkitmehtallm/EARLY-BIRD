import { SOURCE_RANK, eventKey } from "../normalize";
import { formatDay, hoursUntil } from "../time";
import type { Candidate, EventRow } from "../types";

export interface AlertIntent {
  kind: "new" | "early_bird_open" | "deadline_soon" | "changed";
  dedupeSuffix: string;
  urgent: boolean;
  summary: string;
}

export interface MergePlan {
  key: string;
  row: Partial<EventRow>;
  changes: { field: string; old: unknown; new: unknown }[];
  alerts: AlertIntent[];
  isNew: boolean;
}

const rank = (s: string | null | undefined) => SOURCE_RANK[s ?? "web"] ?? 1;

export function isUrgent(e: { early_bird_status: string; early_bird_deadline: string | null; scarcity_signals: string[] }) {
  if (e.early_bird_status === "available") return true;
  if (e.early_bird_deadline && hoursUntil(e.early_bird_deadline) < 72 && hoursUntil(e.early_bird_deadline) > 0) return true;
  return e.scarcity_signals.length > 0;
}

const label = (c: { artistName: string; city: string; date: string }) => `${c.artistName} · ${c.city} · ${formatDay(c.date).long}`;

/**
 * Pure merge of one candidate into the stored row (or a new row).
 * Decides what changes, what is recorded in history, and which alerts fire.
 * No I/O, so the alert rules are unit-tested directly.
 */
export function planMerge(existing: EventRow | null, c: Candidate): MergePlan {
  const key = eventKey(c.artistSlug, c.citySlug, c.date);

  if (!existing) {
    const row: Partial<EventRow> = {
      event_key: key,
      artist_id: c.artistId,
      title: c.title,
      venue: c.venue,
      city: c.city,
      city_slug: c.citySlug,
      starts_on: c.date,
      starts_at: c.startsAt,
      ticket_url: c.ticketUrl,
      price_min_inr: c.priceMinInr,
      early_bird_status: c.earlyBirdStatus,
      early_bird_deadline: c.earlyBirdDeadline,
      scarcity_signals: c.scarcity,
      confidence: c.confidence,
      needs_review: c.needsReview,
      best_source: c.source,
    };
    const urgent = isUrgent({ early_bird_status: c.earlyBirdStatus, early_bird_deadline: c.earlyBirdDeadline, scarcity_signals: c.scarcity });
    const alerts: AlertIntent[] = c.needsReview
      ? []
      : [{ kind: "new", dedupeSuffix: "new", urgent, summary: `Just announced: ${label(c)}` }];
    return { key, row, changes: [], alerts, isNew: true };
  }

  const row: Partial<EventRow> = {};
  const changes: MergePlan["changes"] = [];
  const alerts: AlertIntent[] = [];
  const set = <K extends keyof EventRow>(field: K, value: EventRow[K], record = true) => {
    if (existing[field] === value) return;
    row[field] = value;
    if (record) changes.push({ field, old: existing[field], new: value });
  };
  const outranks = rank(c.source) >= rank(existing.best_source);

  if (c.venue && c.venue !== existing.venue && (outranks || !existing.venue)) {
    set("venue", c.venue);
    if (existing.venue) {
      alerts.push({ kind: "changed", dedupeSuffix: `venue:${c.venue}`, urgent: false, summary: `Venue update: ${label(c)} is now at ${c.venue}` });
    }
  }

  // Early-bird status: never downgrade an open window to "unknown"/"none" on the word of a weaker source.
  const eb = c.earlyBirdStatus;
  const downgrade = (eb === "unknown" || eb === "none") && (existing.early_bird_status === "available" || existing.early_bird_status === "upcoming");
  if (eb !== "unknown" && eb !== existing.early_bird_status && !(downgrade && !outranks)) {
    set("early_bird_status", eb);
    if (eb === "available") {
      alerts.push({
        kind: "early_bird_open",
        dedupeSuffix: `eb_open:${c.earlyBirdDeadline ?? "open"}`,
        urgent: true,
        summary: `Early bird is open: ${label(c)}`,
      });
    }
  }
  if (c.earlyBirdDeadline && c.earlyBirdDeadline !== existing.early_bird_deadline) set("early_bird_deadline", c.earlyBirdDeadline);
  if (c.ticketUrl && (!existing.ticket_url || (outranks && rank(c.source) > rank(existing.best_source)))) set("ticket_url", c.ticketUrl, false);
  if (c.priceMinInr && (!existing.price_min_inr || c.priceMinInr < existing.price_min_inr)) set("price_min_inr", c.priceMinInr, false);
  if (c.startsAt && !existing.starts_at) set("starts_at", c.startsAt, false);
  if (c.title && !existing.title) set("title", c.title, false);
  if (c.scarcity.length) {
    const merged = [...new Set([...existing.scarcity_signals, ...c.scarcity])].slice(0, 6);
    if (merged.length !== existing.scarcity_signals.length) set("scarcity_signals", merged, false);
  }
  if (c.confidence > existing.confidence) set("confidence", c.confidence, false);
  if (rank(c.source) > rank(existing.best_source)) set("best_source", c.source, false);

  // A held-back row confirmed by an independent source becomes a real announcement.
  if (existing.needs_review && !c.needsReview) {
    set("needs_review", false, false);
    alerts.push({
      kind: "new",
      dedupeSuffix: "new",
      urgent: isUrgent({ ...existing, ...row } as EventRow),
      summary: `Just announced: ${label(c)}`,
    });
  }

  return { key, row, changes, alerts, isNew: false };
}

/** Collapses duplicates inside one batch (same show from listing + detail page) before touching the DB. */
export function dedupeBatch(cands: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of cands) {
    const k = eventKey(c.artistSlug, c.citySlug, c.date);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, c);
      continue;
    }
    const keep = rank(c.source) > rank(prev.source) || (rank(c.source) === rank(prev.source) && c.confidence > prev.confidence) ? c : prev;
    const other = keep === c ? prev : c;
    byKey.set(k, {
      ...keep,
      venue: keep.venue ?? other.venue,
      ticketUrl: keep.ticketUrl ?? other.ticketUrl,
      startsAt: keep.startsAt ?? other.startsAt,
      priceMinInr: keep.priceMinInr ?? other.priceMinInr,
      earlyBirdStatus: keep.earlyBirdStatus !== "unknown" ? keep.earlyBirdStatus : other.earlyBirdStatus,
      earlyBirdDeadline: keep.earlyBirdDeadline ?? other.earlyBirdDeadline,
      scarcity: [...new Set([...keep.scarcity, ...other.scarcity])],
      needsReview: keep.needsReview && other.needsReview,
    });
  }
  return [...byKey.values()];
}
