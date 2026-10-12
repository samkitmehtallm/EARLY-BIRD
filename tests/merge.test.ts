import { describe, expect, it } from "vitest";
import { dedupeBatch, planMerge } from "../src/lib/pipeline/merge";
import type { Candidate, EventRow } from "../src/lib/types";

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  artistId: "a1", artistSlug: "prateek-kuhad", artistName: "Prateek Kuhad", title: null, venue: "Phoenix Marketcity",
  city: "Bengaluru", citySlug: "bengaluru", date: "2099-11-14", startsAt: null, ticketUrl: "https://in.bookmyshow.com/x",
  priceMinInr: 1499, earlyBirdStatus: "unknown", earlyBirdDeadline: null, scarcity: [], confidence: 0.9, needsReview: false,
  source: "bookmyshow", sourceUrl: "https://in.bookmyshow.com/x", ...over,
});

const row = (over: Partial<EventRow> = {}): EventRow => ({
  id: "e1", event_key: "prateek-kuhad|bengaluru|2099-11-14", artist_id: "a1", title: null, venue: "Phoenix Marketcity",
  city: "Bengaluru", city_slug: "bengaluru", starts_on: "2099-11-14", starts_at: null, ticket_url: "https://in.bookmyshow.com/x",
  price_min_inr: 1499, early_bird_status: "upcoming", early_bird_deadline: null, scarcity_signals: [], is_bengaluru: true,
  confidence: 0.9, needs_review: false, status: "active", decision: "undecided", decided_at: null, calendar_links: {},
  best_source: "bookmyshow", first_seen_at: "2099-01-01T00:00:00Z", first_seen_run_id: null, last_seen_at: "2099-01-01T00:00:00Z",
  last_changed_at: "2099-01-01T00:00:00Z", ...over,
});

describe("planMerge", () => {
  it("new show → one 'new' alert", () => {
    const p = planMerge(null, cand());
    expect(p.isNew).toBe(true);
    expect(p.alerts.map((a) => a.kind)).toEqual(["new"]);
    expect(p.key).toBe("prateek-kuhad|bengaluru|2099-11-14");
  });
  it("new show with open early bird is urgent", () => {
    expect(planMerge(null, cand({ earlyBirdStatus: "available" })).alerts[0].urgent).toBe(true);
  });
  it("low-confidence show is stored but not alerted", () => {
    expect(planMerge(null, cand({ needsReview: true })).alerts).toEqual([]);
  });
  it("same data again → no changes, no alerts", () => {
    const p = planMerge(row({ early_bird_status: "unknown" }), cand());
    expect(p.changes).toEqual([]);
    expect(p.alerts).toEqual([]);
  });
  it("early bird flips upcoming → available → urgent alert", () => {
    const p = planMerge(row(), cand({ earlyBirdStatus: "available", earlyBirdDeadline: "2099-10-01T12:00:00.000Z" }));
    expect(p.alerts[0]).toMatchObject({ kind: "early_bird_open", urgent: true });
    expect(p.changes.map((c) => c.field)).toContain("early_bird_status");
  });
  it("a weaker source cannot close an open window", () => {
    const p = planMerge(row({ early_bird_status: "available" }), cand({ source: "web", earlyBirdStatus: "none" }));
    expect(p.row.early_bird_status).toBeUndefined();
  });
  it("venue change alerts quietly", () => {
    const p = planMerge(row(), cand({ venue: "Bhartiya City" }));
    expect(p.alerts[0]).toMatchObject({ kind: "changed", urgent: false });
  });
  it("second source confirms a held-back row → announcement fires", () => {
    const p = planMerge(row({ needs_review: true }), cand());
    expect(p.alerts.map((a) => a.kind)).toEqual(["new"]);
  });
});

describe("dedupeBatch", () => {
  it("collapses the same show from two sources, keeping the stronger one and filling gaps", () => {
    const out = dedupeBatch([cand({ source: "web", venue: null, priceMinInr: null }), cand({ source: "district", ticketUrl: null })]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("district");
    expect(out[0].ticketUrl).toBe("https://in.bookmyshow.com/x");
  });
});
