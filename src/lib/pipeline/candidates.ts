import { isKnownIndianCity, matchArtist, normalizeCity, sourceFromUrl, type MatchableArtist } from "../normalize";
import { istDate, istToUtcIso, toIsoDate } from "../time";
import type { Candidate, EarlyBirdStatus, SourceName } from "../types";

export interface RawInput {
  listedArtist: string;
  title: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  date: string | null;
  time?: string | null;
  startsAt?: string | null;
  ticketUrl: string | null;
  priceMinInr: number | null;
  earlyBirdStatus: EarlyBirdStatus;
  earlyBirdDeadline: string | null;
  scarcity: string[];
  confidence: number;
  /** Gemini's watchlist match, when the show came through extraction. */
  llmMatch?: string | null;
  isTribute?: boolean;
}

export type CandidateResult = { ok: true; candidate: Candidate } | { ok: false; reason: string };

/**
 * Turns one raw show into a Candidate, or explains why it was dropped.
 * Two independent signals decide the artist: Gemini's match and the deterministic matcher.
 */
export function toCandidate(
  raw: RawInput,
  ctx: { artists: MatchableArtist[]; sourceUrl: string; source?: SourceName; forcedArtistId?: string },
): CandidateResult {
  if (raw.isTribute) return { ok: false, reason: "tribute or cover act" };

  const date = toIsoDate(raw.date);
  if (!date) return { ok: false, reason: "no performance date" };
  if (date < istDate()) return { ok: false, reason: "date already passed" };

  const city = normalizeCity(raw.city);
  if (!city) return { ok: false, reason: "no city" };
  const country = raw.country?.toUpperCase() ?? null;
  if (country && country !== "IN" && country !== "INDIA") return { ok: false, reason: `outside India (${country})` };
  if (!country && !isKnownIndianCity(city.slug)) return { ok: false, reason: `unknown city ${city.label}` };

  const det = matchArtist(`${raw.listedArtist}`, ctx.artists) ?? (raw.title ? matchArtist(raw.title, ctx.artists) : null);
  const llm = raw.llmMatch
    ? ctx.artists.find((a) => a.name.toLowerCase() === raw.llmMatch!.toLowerCase()) ?? null
    : null;

  let artist: MatchableArtist | null = null;
  let confidence = raw.confidence;
  let needsReview = false;

  if (ctx.forcedArtistId) {
    // Per-artist API search: the API's keyword match is loose, so require our matcher to agree.
    const forced = ctx.artists.find((a) => a.id === ctx.forcedArtistId);
    if (!forced) return { ok: false, reason: "artist no longer watched" };
    if (!det || det.artist.id !== forced.id || det.score < 0.85) {
      return { ok: false, reason: `"${raw.listedArtist}" is not ${forced.name}` };
    }
    artist = forced;
    confidence = Math.max(confidence, det.score);
  } else if (llm && det && llm.id === det.artist.id) {
    artist = llm;
    confidence = Math.max(confidence, 0.85);
  } else if (llm) {
    artist = llm;
    needsReview = confidence < 0.75;
  } else if (det && det.score >= 0.93 && !det.ambiguous) {
    artist = det.artist;
    confidence = Math.min(confidence, 0.8);
  } else {
    return { ok: false, reason: `"${raw.listedArtist}" is not on the watchlist` };
  }

  if (confidence < 0.6) needsReview = true;

  const startsAt = raw.startsAt ?? (raw.time ? istToUtcIso(date, raw.time) : null);
  const ticketUrl = cleanUrl(raw.ticketUrl);
  return {
    ok: true,
    candidate: {
      artistId: artist.id,
      artistSlug: artist.slug,
      artistName: artist.name,
      title: raw.title?.slice(0, 200) ?? null,
      venue: raw.venue?.trim().slice(0, 160) || null,
      city: city.label,
      citySlug: city.slug,
      date,
      startsAt,
      ticketUrl,
      priceMinInr: raw.priceMinInr && raw.priceMinInr > 0 && raw.priceMinInr < 500_000 ? Math.round(raw.priceMinInr) : null,
      earlyBirdStatus: raw.earlyBirdStatus,
      earlyBirdDeadline: validIso(raw.earlyBirdDeadline),
      scarcity: raw.scarcity.slice(0, 5).map((s) => s.slice(0, 60)),
      confidence: Math.round(confidence * 100) / 100,
      needsReview,
      source: ctx.source ?? sourceFromUrl(ticketUrl ?? ctx.sourceUrl),
      sourceUrl: ctx.sourceUrl,
    },
  };
}

function cleanUrl(u: string | null | undefined) {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    for (const p of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(p)) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return null;
  }
}

function validIso(s: string | null | undefined) {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t).toISOString();
}
