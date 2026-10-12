import { describe, expect, it } from "vitest";
import { toCandidate, type RawInput } from "../src/lib/pipeline/candidates";

const artists = [
  { id: "1", name: "Prateek Kuhad", slug: "prateek-kuhad", aliases: [] },
  { id: "2", name: "Coldplay", slug: "coldplay", aliases: [] },
];
const raw = (o: Partial<RawInput> = {}): RawInput => ({
  listedArtist: "Prateek Kuhad", title: "Prateek Kuhad Live", venue: "Palace Grounds", city: "Bangalore", country: "IN",
  date: "2099-11-14", time: "19:30", ticketUrl: "https://in.bookmyshow.com/e?utm_source=x", priceMinInr: 1499,
  earlyBirdStatus: "available", earlyBirdDeadline: "2099-10-01T18:00:00+05:30", scarcity: [], confidence: 0.92, llmMatch: "Prateek Kuhad", ...o,
});
const ctx = { artists, sourceUrl: "https://in.bookmyshow.com/explore" };

describe("toCandidate", () => {
  it("accepts a clean India show and normalises it", () => {
    const r = toCandidate(raw(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate.citySlug).toBe("bengaluru");
    expect(r.candidate.startsAt).toBe("2099-11-14T14:00:00.000Z");
    expect(r.candidate.ticketUrl).toBe("https://in.bookmyshow.com/e");
    expect(r.candidate.source).toBe("bookmyshow");
  });
  it("drops non-India shows", () => {
    expect(toCandidate(raw({ country: "US", city: "New York" }), ctx)).toMatchObject({ ok: false });
  });
  it("drops tribute nights", () => {
    expect(toCandidate(raw({ listedArtist: "Coldplay Tribute", llmMatch: null, isTribute: true }), ctx)).toMatchObject({ ok: false });
  });
  it("drops past dates", () => {
    expect(toCandidate(raw({ date: "2001-01-01" }), ctx)).toMatchObject({ ok: false, reason: "date already passed" });
  });
  it("rejects a loose API keyword hit for a different artist", () => {
    expect(toCandidate(raw({ listedArtist: "Sunburn Arena ft. Someone Else", title: "Sunburn", llmMatch: null }), { ...ctx, forcedArtistId: "1" })).toMatchObject({ ok: false });
  });
  it("holds a single weak LLM-only match for review", () => {
    const r = toCandidate(raw({ listedArtist: "PK and band", title: null, confidence: 0.55 }), ctx);
    expect(r.ok && r.candidate.needsReview).toBe(true);
  });
});
