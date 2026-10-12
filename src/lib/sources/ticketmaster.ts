import { env, NotConfiguredError } from "../env";
import { normalizeCity } from "../normalize";
import { istDate, toIsoDate } from "../time";
import type { EarlyBirdStatus } from "../types";
import { fetchWithTimeout, redact } from "./http";

export interface RawShow {
  listedArtist: string;
  title: string;
  venue: string | null;
  city: string | null;
  country: string | null;
  date: string | null;
  startsAt: string | null;
  ticketUrl: string | null;
  priceMinInr: number | null;
  earlyBirdStatus: EarlyBirdStatus;
  earlyBirdDeadline: string | null;
  scarcity: string[];
  sourceUrl: string;
}

interface TmEvent {
  name: string;
  url?: string;
  dates?: { start?: { localDate?: string; dateTime?: string }; status?: { code?: string } };
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string };
    presales?: { name?: string; startDateTime?: string; endDateTime?: string }[];
  };
  priceRanges?: { min?: number; currency?: string }[];
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; country?: { countryCode?: string } }[];
    attractions?: { name?: string }[];
  };
}

const EARLY = /early|phase\s*1|pre-?sale|presale|first\s+release/i;

/** Ticketmaster Discovery API, India only, music only. Deterministic mapping — no LLM needed. */
export async function ticketmasterSearch(artistName: string): Promise<RawShow[]> {
  if (!env.ticketmasterKey) throw new NotConfiguredError("Ticketmaster");
  const params = new URLSearchParams({
    apikey: env.ticketmasterKey,
    keyword: artistName,
    countryCode: "IN",
    classificationName: "music",
    size: "50",
    sort: "date,asc",
    startDateTime: `${istDate()}T00:00:00Z`,
  });
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 12_000 });
  if (res.status === 401) throw new Error("Ticketmaster rejected the API key (401).");
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}: ${redact(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
  const now = Date.now();

  return (json._embedded?.events ?? []).map((e): RawShow => {
    const venue = e._embedded?.venues?.[0];
    const presales = e.sales?.presales ?? [];
    const early = presales.filter((p) => EARLY.test(p.name ?? ""));
    let status: EarlyBirdStatus = "unknown";
    let deadline: string | null = null;
    for (const p of early) {
      const start = p.startDateTime ? Date.parse(p.startDateTime) : NaN;
      const end = p.endDateTime ? Date.parse(p.endDateTime) : NaN;
      if (!isNaN(end) && end < now) {
        if (status === "unknown") status = "none";
        continue;
      }
      if (!isNaN(start) && start > now) {
        status = status === "available" ? status : "upcoming";
        deadline = deadline ?? p.endDateTime ?? null;
      } else {
        status = "available";
        deadline = p.endDateTime ?? null;
      }
    }
    if (e.dates?.status?.code === "offsale" && status === "unknown") status = "sold_out";
    const city = venue?.city?.name ?? null;
    const price = e.priceRanges?.find((p) => (p.currency ?? "INR") === "INR")?.min;
    return {
      listedArtist: e._embedded?.attractions?.map((a) => a.name).filter(Boolean).join(", ") || e.name,
      title: e.name,
      venue: venue?.name ?? null,
      city: city ? normalizeCity(city)?.label ?? city : null,
      country: venue?.country?.countryCode ?? "IN",
      date: toIsoDate(e.dates?.start?.localDate ?? null),
      startsAt: e.dates?.start?.dateTime ?? null,
      ticketUrl: e.url ?? null,
      priceMinInr: typeof price === "number" ? Math.round(price) : null,
      earlyBirdStatus: status,
      earlyBirdDeadline: deadline,
      scarcity: early.length ? ["presale window"] : [],
      sourceUrl: e.url ?? "https://www.ticketmaster.com",
    };
  });
}
