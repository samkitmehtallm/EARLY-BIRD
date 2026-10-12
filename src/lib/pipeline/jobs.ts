import "server-only";
import { db, must } from "../db";
import { env } from "../env";
import { extractShows, type ExtractedShow } from "../extract/gemini";
import { TICKETING_HOSTS, hostMatches, matchArtist, sourceFromUrl, type MatchableArtist } from "../normalize";
import { bandsintownEvents } from "../sources/bandsintown";
import { jsonLdEvents, reduceHtml } from "../sources/html";
import { googleSearch, scrapePage } from "../sources/scrapingbee";
import { ticketmasterSearch, type RawShow } from "../sources/ticketmaster";
import { sha256 } from "../crypto";
import type { Candidate, ScanJob, SourceName } from "../types";
import { toCandidate, type RawInput } from "./candidates";

export interface JobContext {
  runId: string;
  artists: MatchableArtist[];
  deadlineMs: number;
  creditCap: number;
}

export interface JobOutcome {
  candidates: Candidate[];
  credits: number;
  dropped: string[];
  /** Follow-up page fetches this job discovered. */
  followUps: { url: string; label: string; artistId?: string }[];
  healthSource: string;
}

const PAGE_REFRESH_HOURS = 6;
const MAX_FOLLOWUPS_PER_JOB = 2;

const fromRawShow = (s: RawShow, confidence: number): RawInput => ({
  listedArtist: s.listedArtist,
  title: s.title,
  venue: s.venue,
  city: s.city,
  country: s.country,
  date: s.date,
  startsAt: s.startsAt,
  ticketUrl: s.ticketUrl,
  priceMinInr: s.priceMinInr,
  earlyBirdStatus: s.earlyBirdStatus,
  earlyBirdDeadline: s.earlyBirdDeadline,
  scarcity: s.scarcity,
  confidence,
});

const fromExtracted = (s: ExtractedShow): RawInput => ({
  listedArtist: s.listed_artist,
  title: s.title,
  venue: s.venue,
  city: s.city,
  country: s.country,
  date: s.date,
  time: s.time,
  ticketUrl: s.ticket_url,
  priceMinInr: s.price_min_inr,
  earlyBirdStatus: s.early_bird_status,
  earlyBirdDeadline: s.early_bird_deadline,
  scarcity: s.scarcity_signals,
  confidence: s.confidence,
  llmMatch: s.matched_artist,
  isTribute: s.is_tribute_or_cover,
});

function collect(raws: RawInput[], ctx: JobContext, sourceUrl: string, opts: { source?: SourceName; forcedArtistId?: string } = {}) {
  const candidates: Candidate[] = [];
  const dropped: string[] = [];
  for (const r of raws) {
    const res = toCandidate(r, { artists: ctx.artists, sourceUrl, ...opts });
    if (res.ok) candidates.push(res.candidate);
    else dropped.push(`${r.listedArtist}: ${res.reason}`);
  }
  return { candidates, dropped };
}

async function assertCredits(ctx: JobContext) {
  const { data } = await db().rpc("credits_used_today");
  const used = typeof data === "number" ? data : 0;
  if (used >= ctx.creditCap) {
    throw Object.assign(new Error(`Daily ScrapingBee credit cap reached (${used}/${ctx.creditCap}). Raise it in Settings.`), { skip: true });
  }
}

/** Builds the text Gemini sees for a page: JSON-LD events first (most reliable), then visible text. */
function pageContent(html: string, url: string) {
  const page = reduceHtml(html, url);
  const events = jsonLdEvents(page.jsonLd);
  const ld = events.length ? `STRUCTURED EVENTS (schema.org):\n${JSON.stringify(events).slice(0, 9000)}\n\n` : "";
  return { page, content: `${ld}PAGE TITLE: ${page.title}\n\nVISIBLE TEXT:\n${page.text}`.slice(0, 26_000) };
}

export async function runJob(job: ScanJob, ctx: JobContext): Promise<JobOutcome> {
  const p = job.payload as Record<string, string>;
  const watchlist = ctx.artists.map((a) => a.name);

  switch (job.kind) {
    case "ticketmaster": {
      const shows = await ticketmasterSearch(p.name);
      const r = collect(shows.map((s) => fromRawShow(s, 0.95)), ctx, "https://www.ticketmaster.com", { source: "ticketmaster", forcedArtistId: p.artistId });
      await touchArtist(p.artistId);
      return { ...r, credits: 0, followUps: [], healthSource: "ticketmaster" };
    }

    case "bandsintown": {
      const shows = await bandsintownEvents(p.name);
      const r = collect(shows.map((s) => fromRawShow(s, 0.9)), ctx, `https://www.bandsintown.com/a/${encodeURIComponent(p.name)}`, { source: "bandsintown", forcedArtistId: p.artistId });
      return { ...r, credits: 0, followUps: [], healthSource: "bandsintown" };
    }

    case "search": {
      await assertCredits(ctx);
      const { hits, credits } = await googleSearch(p.query, { deadlineMs: ctx.deadlineMs });
      await touchArtist(p.artistId);
      if (!hits.length) return { candidates: [], dropped: [], credits, followUps: [], healthSource: "google-search" };
      const artist = ctx.artists.find((a) => a.id === p.artistId);
      const relevant = hits.filter((h) => artist && matchArtist(`${h.title} ${h.description}`, [artist]));
      if (!relevant.length) return { candidates: [], dropped: ["no relevant search results"], credits, followUps: [], healthSource: "google-search" };

      const content = relevant.map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.description}`).join("\n\n");
      const shows = await extractShows({ sourceLabel: "Google search results (snippets)", url: `search:${p.query}`, content, watchlist });
      const raws = shows.map(fromExtracted).map((r) => ({ ...r, confidence: Math.min(r.confidence, 0.75) }));
      const out: Candidate[] = [];
      const dropped: string[] = [];
      for (const r of raws) {
        const url = r.ticketUrl ?? relevant[0].url;
        const c = collect([r], ctx, url, { source: sourceFromUrl(url) });
        out.push(...c.candidates);
        dropped.push(...c.dropped);
      }
      const followUps = relevant
        .filter((h) => hostMatches(h.url, TICKETING_HOSTS))
        .slice(0, MAX_FOLLOWUPS_PER_JOB)
        .map((h) => ({ url: h.url, label: `${new URL(h.url).hostname.replace(/^www\.|^in\./, "")} · ${p.name}`, artistId: p.artistId }));
      return { candidates: out, dropped, credits, followUps, healthSource: "google-search" };
    }

    case "listing":
    case "page": {
      const url = p.url;
      const host = sourceFromUrl(url);
      const healthSource = host === "web" ? new URL(url).hostname.replace(/^www\./, "") : host;
      const urlHash = sha256(url);

      if (job.kind === "page") {
        const prev = must(await db().from("fetched_pages").select("fetched_at").eq("url_hash", urlHash).maybeSingle(), "page cache") as { fetched_at: string } | null;
        if (prev && Date.now() - Date.parse(prev.fetched_at) < PAGE_REFRESH_HOURS * 3600_000) {
          return { candidates: [], dropped: ["fetched recently, skipped"], credits: 0, followUps: [], healthSource };
        }
      }

      await assertCredits(ctx);
      const res = await scrapePage(url, { maxStrategy: job.kind === "listing" ? "premium" : "premium", deadlineMs: ctx.deadlineMs });
      const { page, content } = pageContent(res.html, url);
      const contentHash = sha256(content);

      const cached = must(await db().from("fetched_pages").select("content_hash").eq("url_hash", urlHash).maybeSingle(), "page cache") as { content_hash: string | null } | null;
      await db().from("fetched_pages").upsert({
        url_hash: urlHash, url, content_hash: contentHash, http_status: res.status, strategy: res.strategy, fetched_at: new Date().toISOString(),
      });
      if (cached?.content_hash === contentHash) {
        return { candidates: [], dropped: ["page unchanged since last scan"], credits: res.credits, followUps: [], healthSource };
      }

      const shows = await extractShows({ sourceLabel: p.label ?? host, url, content, watchlist });
      const r = collect(shows.map(fromExtracted), ctx, url, { source: host });
      await db().from("fetched_pages").update({ extracted_count: r.candidates.length }).eq("url_hash", urlHash);

      // From a listing page, open detail pages of matched shows that lack early-bird detail.
      const followUps =
        job.kind === "listing"
          ? r.candidates
              .filter((c) => c.ticketUrl && c.ticketUrl !== url && c.earlyBirdStatus === "unknown" && hostMatches(c.ticketUrl, TICKETING_HOSTS))
              .slice(0, MAX_FOLLOWUPS_PER_JOB)
              .map((c) => ({ url: c.ticketUrl!, label: `${healthSource} · ${c.artistName}`, artistId: c.artistId }))
          : [];
      void page;
      return { ...r, credits: res.credits, followUps, healthSource };
    }
  }
}

async function touchArtist(id: string | undefined) {
  if (id) await db().from("artists").update({ last_checked_at: new Date().toISOString() }).eq("id", id);
}

export const sourcesConfigured = () => ({
  ticketmaster: Boolean(env.ticketmasterKey),
  bandsintown: Boolean(env.bandsintownAppId),
  web: Boolean(env.scrapingBeeKey && env.geminiKey),
});
