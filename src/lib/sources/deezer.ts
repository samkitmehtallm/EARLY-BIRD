import { fetchWithTimeout } from "./http";

export interface ArtistSuggestion {
  name: string;
  imageUrl: string | null;
  fans: number;
}

/** Keyless public artist search — powers autocomplete and artist photos. */
export async function searchArtists(q: string, limit = 6): Promise<ArtistSuggestion[]> {
  if (q.trim().length < 2) return [];
  try {
    const res = await fetchWithTimeout(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=${limit}`, {
      timeoutMs: 6_000,
      retries: 0,
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { name: string; picture_medium?: string; nb_fan?: number }[] };
    return (j.data ?? []).map((a) => ({ name: a.name, imageUrl: a.picture_medium ?? null, fans: a.nb_fan ?? 0 }));
  } catch {
    return [];
  }
}

export async function artistImage(name: string): Promise<string | null> {
  const [top] = await searchArtists(name, 1);
  if (!top) return null;
  const same = top.name.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return same ? top.imageUrl : null;
}
