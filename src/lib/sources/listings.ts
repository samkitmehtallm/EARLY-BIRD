/**
 * City listing pages scanned once per run. One page covers every watched artist in
 * that city, so this is the cheapest way to catch a Bengaluru announcement early.
 * Override with LISTING_URLS (comma-separated) without a redeploy of code.
 */
export interface ListingPage {
  url: string;
  label: string;
  citySlug: string;
  /** Bengaluru pages run every scan; others rotate. */
  everyRun: boolean;
}

const DEFAULTS: ListingPage[] = [
  { url: "https://www.district.in/events/music-this-weekend-in-bengaluru", label: "District · Bengaluru music", citySlug: "bengaluru", everyRun: true },
  { url: "https://in.bookmyshow.com/explore/music-shows-bengaluru", label: "BookMyShow · Bengaluru music", citySlug: "bengaluru", everyRun: true },
  { url: "https://allevents.in/bangalore/concerts", label: "AllEvents · Bengaluru concerts", citySlug: "bengaluru", everyRun: true },
  { url: "https://in.bookmyshow.com/explore/music-shows-mumbai", label: "BookMyShow · Mumbai music", citySlug: "mumbai", everyRun: false },
  { url: "https://in.bookmyshow.com/explore/music-shows-national-capital-region-ncr", label: "BookMyShow · Delhi NCR music", citySlug: "delhi-ncr", everyRun: false },
  { url: "https://allevents.in/pune/concerts", label: "AllEvents · Pune concerts", citySlug: "pune", everyRun: false },
  { url: "https://allevents.in/hyderabad/concerts", label: "AllEvents · Hyderabad concerts", citySlug: "hyderabad", everyRun: false },
];

export function listingPages(): ListingPage[] {
  const raw = process.env.LISTING_URLS;
  if (!raw) return DEFAULTS;
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => {
      const isBlr = /bengaluru|bangalore/i.test(url);
      return { url, label: new URL(url).hostname.replace(/^www\.|^in\./, ""), citySlug: isBlr ? "bengaluru" : "india", everyRun: isBlr };
    });
}

/** Two non-Bengaluru pages per run, rotating by the half-hour so all cities get covered within a few runs. */
export function pagesForThisRun(now = new Date()): ListingPage[] {
  const all = listingPages();
  const fixed = all.filter((p) => p.everyRun);
  const rotating = all.filter((p) => !p.everyRun);
  if (!rotating.length) return fixed;
  const slot = Math.floor(now.getTime() / (30 * 60 * 1000));
  const pick = [rotating[slot % rotating.length], rotating[(slot + 1) % rotating.length]];
  return [...fixed, ...new Set(pick)];
}
