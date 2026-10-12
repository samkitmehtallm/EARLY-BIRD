/* Generates supabase/seed.sql from a readable list. Run: npx tsx scripts/gen-seed.ts */
import { writeFileSync } from "node:fs";
import { eventKey, normalizeCity, slugify } from "../src/lib/normalize";

type A = [name: string, tier: "priority" | "normal", origin: "india" | "international", aliases?: string[]];
const artists: A[] = [
  ["Prateek Kuhad", "priority", "india"],
  ["Anuv Jain", "priority", "india"],
  ["The Local Train", "priority", "india", ["Local Train"]],
  ["When Chai Met Toast", "priority", "india", ["WCMT"]],
  ["Ritviz", "priority", "india"],
  ["Seedhe Maut", "priority", "india"],
  ["Indian Ocean", "priority", "india"],
  ["Peter Cat Recording Co.", "priority", "india", ["Peter Cat Recording Company", "PCRC"]],
  ["Khalid", "priority", "international"],
  ["Fred again..", "priority", "international", ["Fred again", "Fred Again.."]],
  ["Gorillaz", "priority", "international"],
  ["Foo Fighters", "priority", "international"],
  ["Lifafa", "normal", "india"],
  ["Parvaaz", "normal", "india"],
  ["Thaikkudam Bridge", "normal", "india"],
  ["Raghu Dixit Project", "normal", "india", ["Raghu Dixit", "The Raghu Dixit Project"]],
  ["Swarathma", "normal", "india"],
  ["The Yellow Diary", "normal", "india", ["Yellow Diary"]],
  ["Taba Chake", "normal", "india"],
  ["Aswekeepsearching", "normal", "india"],
  ["Lost Stories", "normal", "india"],
  ["Nucleya", "normal", "india"],
  ["Karsh Kale", "normal", "india"],
  ["Hanumankind", "normal", "india"],
  ["Bloodywood", "normal", "india"],
  ["Ankur Tewari", "normal", "india", ["Ankur Tewari & The Ghalat Family"]],
  ["Sanjeeta Bhattacharya", "normal", "india"],
  ["Easy Wanderlings", "normal", "india"],
  ["Komorebi", "normal", "india"],
  ["Sid Sriram", "normal", "india"],
  ["Aditya Rikhari", "normal", "india"],
  ["Kayan", "normal", "india"],
  ["Zaeden", "normal", "india"],
  ["Mali", "normal", "india"],
  ["Dot.", "normal", "india", ["Dot"]],
  ["Talwiinder", "normal", "india"],
  ["Divine", "normal", "india"],
  ["KR$NA", "normal", "india", ["Krsna", "Krishna Kaul"]],
  ["Lisa Mishra", "normal", "india"],
  ["Shankuraj Konwar", "normal", "india"],
  ["Kamakshi Khanna", "normal", "india"],
  ["Tejas", "normal", "india"],
  ["Guns N' Roses", "normal", "international", ["Guns N Roses", "Guns and Roses", "GNR"]],
  ["Anyma", "normal", "international"],
  ["The Chainsmokers", "normal", "international", ["Chainsmokers"]],
  ["Lauv", "normal", "international"],
  ["LANY", "normal", "international"],
  ["Jacob Collier", "normal", "international"],
  ["Cigarettes After Sex", "normal", "international"],
  ["Boy Pablo", "normal", "international", ["boy pablo"]],
  ["Tom Odell", "normal", "international"],
  ["Joji", "normal", "international"],
  ["Keinemusik", "normal", "international"],
  ["Peggy Gou", "normal", "international"],
  ["Alan Walker", "normal", "international"],
  ["Martin Garrix", "normal", "international"],
  ["Bryan Adams", "normal", "international"],
  ["Louis Tomlinson", "normal", "international"],
  ["Kodaline", "normal", "international"],
  ["RÜFÜS DU SOL", "normal", "international", ["Rufus Du Sol", "Rufus"]],
];

// Real, publicly announced shows, each with the article it was verified from (checked 12 Oct 2026).
type S = {
  artist: string; city: string; venue: string | null; date: string; time?: string; ticket?: string | null;
  price?: number | null; eb?: string; scarcity?: string[]; source: string; url: string;
};
const shows: S[] = [
  { artist: "Guns N' Roses", city: "Bengaluru", venue: "NICE Grounds", date: "2026-11-14", ticket: "https://in.bookmyshow.com/", eb: "none", source: "web", url: "https://www.etvbharat.com/en/lifestyle/guns-n-roses-india-2026-shows-dates-venues-enn26060806376" },
  { artist: "Guns N' Roses", city: "Guwahati", venue: "Khanapara Veterinary Ground", date: "2026-11-17", ticket: "https://in.bookmyshow.com/", eb: "none", source: "web", url: "https://www.etvbharat.com/en/lifestyle/guns-n-roses-india-2026-shows-dates-venues-enn26060806376" },
  { artist: "Anyma", city: "Mumbai", venue: "Mahalaxmi Racecourse", date: "2026-11-21", ticket: "https://in.bookmyshow.com/", source: "web", url: "https://www.esquireindia.co.in/culture/books-and-music/the-india-concert-calendar-2026-everything-thats-lined-up-for-the-rest-of-the-year" },
  { artist: "Indian Ocean", city: "Bengaluru", venue: "Phoenix Marketcity", date: "2026-11-28", ticket: null, source: "web", url: "https://www.esquireindia.co.in/culture/books-and-music/the-india-concert-calendar-2026-everything-thats-lined-up-for-the-rest-of-the-year" },
  { artist: "Khalid", city: "Gurugram", venue: "HUDA Gymkhana Club", date: "2026-12-13", time: "18:00", ticket: "https://www.skillboxes.com/", price: 2549, eb: "available", scarcity: ["Phase 1"], source: "skillbox", url: "https://www.timeout.com/india/news/khalid-announces-india-tour-in-december-tickets-dates-and-venues-here-082126" },
  { artist: "Khalid", city: "Bengaluru", venue: "Bharatiya Mall of Bengaluru", date: "2026-12-15", time: "18:00", ticket: "https://www.skillboxes.com/", price: 2549, eb: "available", scarcity: ["Phase 1"], source: "skillbox", url: "https://www.timeout.com/india/news/khalid-announces-india-tour-in-december-tickets-dates-and-venues-here-082126" },
  { artist: "Khalid", city: "Mumbai", venue: "NESCO Center Hall 6, Goregaon", date: "2026-12-17", time: "18:00", ticket: "https://www.skillboxes.com/", price: 2549, eb: "available", scarcity: ["Phase 1"], source: "skillbox", url: "https://www.timeout.com/india/news/khalid-announces-india-tour-in-december-tickets-dates-and-venues-here-082126" },
  { artist: "The Chainsmokers", city: "Bengaluru", venue: null, date: "2026-12-20", ticket: "https://in.bookmyshow.com/", source: "web", url: "https://www.esquireindia.co.in/culture/books-and-music/the-india-concert-calendar-2026-everything-thats-lined-up-for-the-rest-of-the-year" },
  { artist: "Gorillaz", city: "Bengaluru", venue: "District Arena @ Terraform", date: "2027-01-23", ticket: "https://www.district.in/", price: 5000, eb: "none", source: "district", url: "https://www.timeout.com/india/news/gorillaz-2027-india-tour-a-new-guwahati-date-just-dropped-what-to-know-091026" },
  { artist: "Gorillaz", city: "Mumbai", venue: "Jio World Garden, BKC", date: "2027-01-27", ticket: "https://www.district.in/", price: 5000, eb: "none", source: "district", url: "https://www.timeout.com/india/news/gorillaz-2027-india-tour-a-new-guwahati-date-just-dropped-what-to-know-091026" },
  { artist: "Gorillaz", city: "Guwahati", venue: "Sarusajai Sports Complex", date: "2027-01-31", ticket: "https://www.district.in/", eb: "none", source: "district", url: "https://www.timeout.com/india/news/gorillaz-2027-india-tour-a-new-guwahati-date-just-dropped-what-to-know-091026" },
  { artist: "Foo Fighters", city: "Bengaluru", venue: "Bengaluru LIVE", date: "2027-01-29", ticket: "https://in.bookmyshow.com/", eb: "none", source: "web", url: "https://www.hollywoodreporterindia.com/features/insight/foo-fighters-announce-india-debut-for-january-2027-tickets-on-sale-tomorrow" },
  { artist: "Foo Fighters", city: "Mumbai", venue: "Mahalaxmi Racecourse", date: "2027-01-31", ticket: "https://in.bookmyshow.com/", eb: "none", source: "web", url: "https://www.hollywoodreporterindia.com/features/insight/foo-fighters-announce-india-debut-for-january-2027-tickets-on-sale-tomorrow" },
];

const q = (v: unknown) =>
  v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a: string[] = []) => `array[${a.map(q).join(",")}]::text[]`;

let sql = `-- Early Bird seed data. Generated by scripts/gen-seed.ts — edit that file, not this one.
-- Safe to re-run: every insert is idempotent.

insert into public.artists (name, slug, aliases, tier, origin, source) values
${artists.map(([n, t, o, al]) => `  (${q(n)}, ${q(slugify(n))}, ${arr(al)}, ${q(t)}, ${q(o)}, 'seed')`).join(",\n")}
on conflict (slug) do nothing;

-- A seed "scan" so every seeded show has provenance like a live one.
insert into public.scan_runs (id, trigger, status, finished_at, notes)
values ('00000000-0000-4000-8000-000000000001', 'seed', 'completed', now(),
        array['Seeded from public announcements verified on 12 Oct 2026. Live scans add and update shows from here.'])
on conflict (id) do nothing;
`;

for (const s of shows) {
  const city = normalizeCity(s.city)!;
  const slug = slugify(s.artist);
  const key = eventKey(slug, city.slug, s.date);
  const startsAt = s.time ? `'${s.date}T${s.time}:00+05:30'::timestamptz` : "null";
  sql += `
insert into public.events (event_key, artist_id, title, venue, city, city_slug, starts_on, starts_at, ticket_url, price_min_inr,
  early_bird_status, scarcity_signals, confidence, best_source, first_seen_run_id)
select ${q(key)}, a.id, ${q(`${s.artist} live in ${city.label}`)}, ${q(s.venue)}, ${q(city.label)}, ${q(city.slug)}, ${q(s.date)}, ${startsAt},
  ${q(s.ticket ?? null)}, ${q(s.price ?? null)}, ${q(s.eb ?? "unknown")}, ${arr(s.scarcity)}, 0.9, ${q(s.source)}, '00000000-0000-4000-8000-000000000001'
from public.artists a where a.slug = ${q(slug)}
on conflict (event_key) do nothing;
insert into public.event_sources (event_id, source, url)
select e.id, 'web', ${q(s.url)} from public.events e where e.event_key = ${q(key)}
on conflict do nothing;
`;
}

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log(`seed.sql: ${artists.length} artists, ${shows.length} shows`);
