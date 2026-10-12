/**
 * Deterministic normalisation: cities, artist names, event keys.
 * Gemini handles the messy reading; this file makes the final call reproducible.
 */

export function stripDiacritics(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

export function slugify(s: string) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ───────────────────────── cities ─────────────────────────

const CITY_ALIASES: Record<string, { label: string; aliases: string[] }> = {
  bengaluru: {
    label: "Bengaluru",
    aliases: [
      "bengaluru", "bangalore", "blr", "bengaluru urban", "bangalore urban", "whitefield", "koramangala",
      "indiranagar", "hebbal", "yelahanka", "electronic city", "jayanagar", "hsr layout", "marathahalli",
      "ub city", "palace grounds", "devanahalli", "sarjapur", "bellandur", "jp nagar", "mg road",
    ],
  },
  mumbai: { label: "Mumbai", aliases: ["mumbai", "bombay", "navi mumbai", "thane", "bandra", "worli", "andheri", "lower parel", "powai", "mahalaxmi", "goregaon", "nesco"] },
  "delhi-ncr": { label: "Delhi NCR", aliases: ["delhi", "new delhi", "delhi ncr", "ncr", "gurugram", "gurgaon", "noida", "greater noida", "faridabad", "ghaziabad"] },
  pune: { label: "Pune", aliases: ["pune", "poona", "hinjewadi", "kharadi", "viman nagar", "koregaon park"] },
  hyderabad: { label: "Hyderabad", aliases: ["hyderabad", "secunderabad", "hitec city", "hitech city", "gachibowli", "madhapur", "jubilee hills"] },
  chennai: { label: "Chennai", aliases: ["chennai", "madras"] },
  kolkata: { label: "Kolkata", aliases: ["kolkata", "calcutta"] },
  goa: { label: "Goa", aliases: ["goa", "north goa", "south goa", "panaji", "panjim", "vagator", "anjuna", "mapusa", "margao", "arpora"] },
  ahmedabad: { label: "Ahmedabad", aliases: ["ahmedabad", "gandhinagar"] },
  jaipur: { label: "Jaipur", aliases: ["jaipur"] },
  chandigarh: { label: "Chandigarh", aliases: ["chandigarh", "mohali", "panchkula"] },
  kochi: { label: "Kochi", aliases: ["kochi", "cochin", "ernakulam"] },
  shillong: { label: "Shillong", aliases: ["shillong"] },
  guwahati: { label: "Guwahati", aliases: ["guwahati", "gauhati"] },
  lucknow: { label: "Lucknow", aliases: ["lucknow"] },
  indore: { label: "Indore", aliases: ["indore"] },
  mysuru: { label: "Mysuru", aliases: ["mysuru", "mysore"] },
  udaipur: { label: "Udaipur", aliases: ["udaipur"] },
};

const ALIAS_INDEX: [string, string][] = Object.entries(CITY_ALIASES)
  .flatMap(([slug, c]) => c.aliases.map((a) => [a, slug] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

export const MAJOR_CITIES = Object.entries(CITY_ALIASES).map(([slug, c]) => ({ slug, label: c.label }));
export const HOME_CITY = "bengaluru";

/** Maps "Bangalore", "Whitefield, Bengaluru", "BLR" → { slug: "bengaluru", label: "Bengaluru" }. */
export function normalizeCity(raw: string | null | undefined): { slug: string; label: string } | null {
  if (!raw) return null;
  const s = ` ${stripDiacritics(raw).toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  if (s.trim() === "") return null;
  for (const [alias, slug] of ALIAS_INDEX) {
    if (s.includes(` ${alias} `)) return { slug, label: CITY_ALIASES[slug].label };
  }
  const first = raw.split(",")[0].trim();
  if (!first) return null;
  const label = first.replace(/\b\w/g, (c) => c.toUpperCase());
  return { slug: slugify(first), label };
}

export const isKnownIndianCity = (slug: string) => slug in CITY_ALIASES;

// ───────────────────────── artists ─────────────────────────

const NOISE = new Set([
  "live", "concert", "concerts", "tour", "india", "indian", "in", "presents", "present", "presented", "by",
  "the", "show", "shows", "official", "tickets", "ticket", "music", "night", "edition", "world", "2025",
  "2026", "2027", "feat", "ft", "featuring", "with", "and", "at", "a", "an", "on", "experience",
]);

export function nameTokens(s: string): string[] {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeName(s: string): string {
  const t = nameTokens(s).filter((w) => !NOISE.has(w));
  return (t.length ? t : nameTokens(s)).join(" ");
}

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < Math.min(4, a.length, b.length) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

export interface MatchableArtist {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
}

export interface ArtistMatch<A extends MatchableArtist = MatchableArtist> {
  artist: A;
  score: number;
  method: "exact" | "phrase" | "fuzzy";
  /** Short or common names ("Dot.", "Mali") need a second signal before we trust them. */
  ambiguous: boolean;
}

/**
 * Finds the watched artist named in `text` (an event title or a listed artist name).
 * exact → 1.0, whole-phrase containment → 0.93, else Jaro-Winkler on the normalised strings.
 */
export function matchArtist<A extends MatchableArtist>(text: string, artists: A[]): ArtistMatch<A> | null {
  const hay = ` ${nameTokens(text).join(" ")} `;
  const hayNorm = normalizeName(text);
  let best: ArtistMatch<A> | null = null;

  for (const artist of artists) {
    for (const variant of [artist.name, ...artist.aliases]) {
      const v = normalizeName(variant);
      if (!v) continue;
      const ambiguous = v.replace(/ /g, "").length <= 4;
      let score = 0;
      let method: ArtistMatch["method"] = "fuzzy";
      if (hayNorm === v) {
        score = 1;
        method = "exact";
      } else if (hay.includes(` ${nameTokens(variant).join(" ")} `) || hay.includes(` ${v} `)) {
        score = ambiguous ? 0.7 : 0.93;
        method = "phrase";
      } else if (!ambiguous) {
        score = jaroWinkler(hayNorm, v);
      }
      if (!best || score > best.score) best = { artist, score, method, ambiguous };
    }
  }
  return best && best.score >= 0.6 ? best : null;
}

export function eventKey(artistSlug: string, citySlug: string, date: string) {
  return `${artistSlug}|${citySlug}|${date}`;
}

// ───────────────────────── sources ─────────────────────────

const SOURCE_HOSTS: [RegExp, import("./types").SourceName][] = [
  [/bookmyshow\.com$/, "bookmyshow"],
  [/district\.in$/, "district"],
  [/insider\.in$/, "insider"],
  [/skillboxes\.com$/, "skillbox"],
  [/ticketmaster\./, "ticketmaster"],
  [/bandsintown\.com$/, "bandsintown"],
  [/allevents\.in$/, "allevents"],
];

export function sourceFromUrl(url: string): import("./types").SourceName {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [re, name] of SOURCE_HOSTS) if (re.test(host)) return name;
  } catch {}
  return "web";
}

/** Hosts where an individual event page is worth fetching for ticket and early-bird detail. */
export const TICKETING_HOSTS = [
  "bookmyshow.com", "district.in", "insider.in", "skillboxes.com", "ticketmaster.com", "ticketmaster.co.in",
  "allevents.in", "highape.com", "sortmyscene.com", "ticketgenie.in", "eventbrite.com", "eventbrite.co.in",
  "songkick.com", "bandsintown.com", "zomato.com",
];

export const NEWS_HOSTS = [
  "rollingstoneindia.com", "thehindu.com", "hindustantimes.com", "timesofindia.indiatimes.com",
  "indianexpress.com", "deccanherald.com", "homegrown.co.in", "wildcity.in", "news18.com", "ndtv.com",
  "moneycontrol.com", "livemint.com", "thequint.com", "billboard.com",
];

export function hostMatches(url: string, hosts: string[]) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return hosts.some((x) => h === x || h.endsWith(`.${x}`));
  } catch {
    return false;
  }
}

export const SOURCE_RANK: Record<string, number> = {
  ticketmaster: 5, bookmyshow: 5, district: 5, insider: 5, skillbox: 4, bandsintown: 4, allevents: 3, web: 2,
};

export const SOURCE_LABEL: Record<string, string> = {
  ticketmaster: "Ticketmaster", bandsintown: "Bandsintown", bookmyshow: "BookMyShow", district: "District",
  insider: "Insider", skillbox: "Skillbox", allevents: "AllEvents", web: "Web",
};
