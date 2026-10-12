export type EarlyBirdStatus = "available" | "upcoming" | "sold_out" | "none" | "unknown";
export type Decision = "undecided" | "going" | "maybe" | "skip";
export type SourceName =
  | "ticketmaster"
  | "bandsintown"
  | "bookmyshow"
  | "district"
  | "insider"
  | "skillbox"
  | "allevents"
  | "web";

export interface Artist {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  tier: "priority" | "normal";
  origin: "india" | "international";
  image_url: string | null;
  source: string;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  event_key: string;
  artist_id: string;
  title: string | null;
  venue: string | null;
  city: string;
  city_slug: string;
  starts_on: string;
  starts_at: string | null;
  ticket_url: string | null;
  price_min_inr: number | null;
  early_bird_status: EarlyBirdStatus;
  early_bird_deadline: string | null;
  scarcity_signals: string[];
  is_bengaluru: boolean;
  confidence: number;
  needs_review: boolean;
  status: "active" | "cancelled";
  decision: Decision;
  decided_at: string | null;
  calendar_links: Record<string, string>;
  best_source: string | null;
  first_seen_at: string;
  first_seen_run_id: string | null;
  last_seen_at: string;
  last_changed_at: string;
}

export interface EventSourceRow {
  id: string;
  event_id: string;
  source: string;
  url: string;
  first_seen_at: string;
  last_seen_at: string;
}

export interface FeedEvent extends EventRow {
  artist: Pick<Artist, "id" | "name" | "slug" | "image_url" | "tier">;
  sources: Pick<EventSourceRow, "source" | "url" | "first_seen_at" | "last_seen_at">[];
}

/** A show as a source adapter reports it, before it is matched and merged. */
export interface Candidate {
  artistId: string;
  artistSlug: string;
  artistName: string;
  title: string | null;
  venue: string | null;
  city: string;
  citySlug: string;
  date: string; // yyyy-mm-dd (IST)
  startsAt: string | null; // ISO
  ticketUrl: string | null;
  priceMinInr: number | null;
  earlyBirdStatus: EarlyBirdStatus;
  earlyBirdDeadline: string | null;
  scarcity: string[];
  confidence: number;
  needsReview: boolean;
  source: SourceName;
  sourceUrl: string;
}

export interface ScanRun {
  id: string;
  trigger: "cron" | "manual" | "seed";
  status: "running" | "completed" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  heartbeat_at: string;
  jobs_total: number;
  jobs_done: number;
  jobs_failed: number;
  events_new: number;
  events_changed: number;
  credits_used: number;
  notes: string[];
  error: string | null;
}

export interface ScanJob {
  id: string;
  run_id: string;
  kind: "ticketmaster" | "bandsintown" | "listing" | "search" | "page";
  label: string;
  payload: Record<string, unknown>;
  priority: number;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  attempts: number;
  credits: number;
  found: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface AlertRow {
  id: string;
  event_id: string;
  kind: "new" | "early_bird_open" | "deadline_soon" | "changed";
  dedupe_key: string;
  summary: string;
  urgent: boolean;
  status: "pending" | "sent" | "failed" | "in_app";
  channel: string | null;
  attempts: number;
  provider_message_id: string | null;
  error: string | null;
  run_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface Settings {
  id: 1;
  alert_email: string | null;
  home_city: string;
  google_email: string | null;
  google_refresh_token_enc: string | null;
  google_connected_at: string | null;
  daily_credit_cap: number;
  updated_at: string;
}
