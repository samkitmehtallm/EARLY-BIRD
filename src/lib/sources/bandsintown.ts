import { env, NotConfiguredError } from "../env";
import { toIsoDate } from "../time";
import { fetchWithTimeout } from "./http";
import type { RawShow } from "./ticketmaster";

interface BitEvent {
  url?: string;
  datetime?: string;
  title?: string;
  lineup?: string[];
  venue?: { name?: string; city?: string; country?: string };
  offers?: { type?: string; url?: string; status?: string }[];
}

/** Bandsintown public artist events. Optional: only runs when BANDSINTOWN_APP_ID is set. */
export async function bandsintownEvents(artistName: string): Promise<RawShow[]> {
  if (!env.bandsintownAppId) throw new NotConfiguredError("Bandsintown");
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(env.bandsintownAppId)}&date=upcoming`;
  const res = await fetchWithTimeout(url, { timeoutMs: 10_000 });
  if (res.status === 404) return [];
  if (res.status === 403) throw new Error("Bandsintown refused the app_id (403).");
  if (!res.ok) throw new Error(`Bandsintown ${res.status}`);
  const data = (await res.json()) as BitEvent[] | { errorMessage?: string };
  if (!Array.isArray(data)) return [];

  return data
    .filter((e) => /india/i.test(e.venue?.country ?? ""))
    .map((e) => {
      const tickets = e.offers?.find((o) => o.type === "Tickets");
      return {
        listedArtist: e.lineup?.join(", ") || artistName,
        title: e.title || `${artistName} live`,
        venue: e.venue?.name ?? null,
        city: e.venue?.city ?? null,
        country: "IN",
        date: toIsoDate(e.datetime?.slice(0, 10) ?? null),
        startsAt: null,
        ticketUrl: tickets?.url ?? e.url ?? null,
        priceMinInr: null,
        earlyBirdStatus: tickets?.status === "sold out" ? "sold_out" : "unknown",
        earlyBirdDeadline: null,
        scarcity: [],
        sourceUrl: e.url ?? "https://www.bandsintown.com",
      } satisfies RawShow;
    });
}
