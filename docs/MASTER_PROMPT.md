# Early Bird — Master Build Prompt (for Claude Code)

Paste this whole file into Claude Code at the root of an empty folder (or this repo, to extend it). It is written so an agent can build, verify and ship the product without stopping to ask questions, including while API keys are still missing.

---

## 0. Operating rules for the agent

1. **Never stop for a missing key.** Build every integration fully. If a key is absent, the feature must degrade gracefully (clear message in the UI, the rest keeps working) and the build must still pass. Record anything you could not verify in `DECISIONS.md`.
2. **Never throw at import time.** Read env vars lazily. `next build` must succeed with zero environment variables.
3. **Every page that touches the database is `export const dynamic = "force-dynamic"`**, so nothing queries the DB during the build.
4. **Never invent data.** Seeded shows must be real public announcements with a source URL. Gemini must return `null` for anything not written on the page.
5. **Never commit secrets.** `.env*` is git-ignored; `.env.example` lists every variable with a comment.
6. **Verification gate after every phase:** `npm run typecheck && npm run lint && npm test && npm run build`. Do not move on with a red gate.
7. **Small, honest UI copy.** Name things the way the user would. Errors say what happened and how to fix it.
8. **Timezone is Asia/Kolkata** for every “today”, every displayed time and every calendar event. Store `timestamptz` in UTC.

## 1. The problem (read twice)

Karan, in Bengaluru, follows ~60 artists — mostly **mid-tier** acts (Indian indie, touring internationals) whose India dates are announced quietly and whose **early-bird / Phase 1** tickets sell out within a day. No single site lists everything. He needs:

- to hear about a show **the moment it is announced**, anywhere in India, with **Bengaluru prioritised**;
- the **early-bird state** (open / opening soon / sold out / none) and its **deadline**, flagged as urgent;
- a one-tap way to **decide** and have it land on his **calendar** with a reminder before the window closes;
- **zero friction**: no mandatory logins, no setup walls; the dashboard is useful on first open.

Grading weights: **UI/UX, complexity, user experience, external APIs**, and *do not mandate things that make the experience difficult*.

## 2. Stack (fixed)

- Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS v4 (whatever `create-next-app@15` installs — do not mix v3 config).
- Supabase Postgres via `@supabase/supabase-js` (HTTP — no raw TCP pooling issues on Vercel).
- Gemini via `@google/genai`, model from `GEMINI_MODEL` (default `gemini-2.5-flash`), JSON mode + `responseSchema`, `temperature: 0`, `thinkingBudget: 0` for 2.5-flash.
- ScrapingBee (page rendering with Indian proxies + Google search endpoint), Ticketmaster Discovery (optional), Bandsintown (optional), Deezer public search (keyless; autocomplete + artist photos).
- Gmail API (`users.messages.send`) + Google Calendar API (`events.insert`) through **one** Google OAuth connection (scopes: `openid email gmail.send calendar.events`; `access_type=offline`, `prompt=consent`). Refresh token encrypted AES-256-GCM at rest. Fallback email: Gmail SMTP app password via nodemailer. Fallback calendar: prefilled `calendar.google.com/calendar/render?action=TEMPLATE` link.
- Fonts: `geist` package (sans + mono) and `@fontsource-variable/bricolage-grotesque` for display (self-hosted; no build-time font fetch).
- Tests: Vitest. Icons: lucide-react. Toasts: sonner.

## 3. Components map

```
Triggers (Vercel Cron daily · cron-job.org every 30 min · "Scan now")
  → Job planner (scan_runs + scan_jobs; one running scan max)
  → Job claimer (claim_jobs RPC, FOR UPDATE SKIP LOCKED, 3 at a time, 45 s budget per call)
      ├─ listing   : ScrapingBee render → reduce HTML (JSON-LD first) → Gemini
      ├─ search    : ScrapingBee Google → snippets → Gemini → follow-up page jobs for ticketing hosts
      ├─ page      : ScrapingBee render (6 h cache, content hash) → Gemini
      ├─ ticketmaster / bandsintown : API → deterministic mapping (no LLM)
  → Candidate check (India only, future date, two-signal artist match, tribute filter)
  → Dedupe & diff (event_key = artist_slug|city_slug|yyyy-mm-dd; first_seen_at set once)
  → Postgres (events, event_sources, event_changes)
  → Alert queue (unique dedupe_key) → digest via Gmail API (Bengaluru first, urgent bold)
  → Decision page / dashboard → Google Calendar (show + early-bird reminder, idempotent ids)
Dashboard reads Postgres: feed, artists, alerts, live data log, settings.
```

## 4. Database (Supabase) — exact schema

Create `supabase/migrations/0001_init.sql` with:

- `private.app_config(secret)` + `public.app_ok()` (security definer) that compares header `x-app-secret` from `current_setting('request.headers')`. RLS on **every** table with policy `using (app_ok()) with check (app_ok())` for `anon, authenticated`. The server uses the service-role key, **or** the publishable key + `x-app-secret`. The browser never gets a DB key.
- `artists(id, name, slug unique, aliases text[], tier priority|normal, origin, image_url, source seed|manual|csv|spotify, is_active, last_checked_at, created_at)`
- `events(id, event_key unique, artist_id, title, venue, city, city_slug, starts_on date, starts_at, ticket_url, price_min_inr, early_bird_status available|upcoming|sold_out|none|unknown, early_bird_deadline, scarcity_signals text[], is_bengaluru generated (city_slug='bengaluru'), confidence, needs_review, status active|cancelled, decision undecided|going|maybe|skip, decided_at, calendar_links jsonb, best_source, first_seen_at, first_seen_run_id, last_seen_at, last_changed_at)`
- `event_sources(event_id, source, url, first_seen_at, last_seen_at, unique(event_id,source,url))`
- `event_changes(event_id, field, old_value jsonb, new_value jsonb, run_id, created_at)`
- `scan_runs(trigger cron|manual|seed, status running|completed|partial|failed, heartbeat_at, jobs_total/done/failed, events_new/changed, credits_used, notes text[])` + **partial unique index** `one_running_scan on ((true)) where status='running'`
- `scan_jobs(run_id, kind ticketmaster|bandsintown|listing|search|page, label, payload jsonb, priority, status pending|running|done|failed|skipped, attempts, credits, found, error, timestamps)`
- `source_health(source pk, last_ok_at, last_error_at, last_error, consecutive_failures, requests_today, credits_today, day)`
- `fetched_pages(url_hash pk, url, content_hash, http_status, strategy, fetched_at, extracted_count)`
- `alerts(event_id, kind new|early_bird_open|deadline_soon|changed, dedupe_key unique, summary, urgent, status pending|sent|failed|in_app, channel, attempts, provider_message_id, error, run_id, created_at, sent_at)`
- `settings` singleton (`id=1`): alert_email, home_city, google_email, google_refresh_token_enc, google_connected_at, daily_credit_cap (default 300).
- RPCs: `start_scan(trigger)` (closes runs with no heartbeat for 10 min, returns the running run or inserts one, handles the unique-violation race), `claim_jobs(run, limit)` (reclaims jobs stuck `running` > 3 min, attempts < 3), `record_source(source, ok, credits, error)` (IST-day counters), `credits_used_today()`.

`supabase/seed.sql` is **generated** by `scripts/gen-seed.ts` from a readable list: 60 artists (12 favourites) with aliases, and only **verified real** upcoming shows, each linked to its source article, recorded under a fixed `seed` scan run.

## 5. Normalisation (pure, unit-tested) — `src/lib/normalize.ts`

- `slugify` (NFKD, `&`→and, `$`→s).
- `normalizeCity` with an alias table: Bengaluru ← bangalore, blr, whitefield, koramangala, indiranagar, hebbal, palace grounds…; Delhi NCR ← gurugram, gurgaon, noida…; Mumbai, Pune, Hyderabad, Chennai, Kolkata, Goa, Guwahati, Kochi, etc. Longest alias wins; unknown cities keep their first comma part.
- `normalizeName` removes tour noise (`live, tour, india, presents, 2026, feat…`).
- `matchArtist(text, artists)` → exact (1.0) / whole-phrase (0.93; 0.7 and `ambiguous` for names ≤ 4 chars) / Jaro-Winkler. Returns null under 0.6.
- `eventKey(artistSlug, citySlug, date)`.
- `sourceFromUrl`, `TICKETING_HOSTS`, `SOURCE_RANK` (ticketing sites & official APIs 5 > Skillbox/Bandsintown 4 > AllEvents 3 > web 2).

## 6. Sources

- `scrapingbee.ts` — `scrapePage(url, {maxStrategy, deadlineMs})` with ladder render → premium (`country_code=in`) → stealth; treats Cloudflare/captcha HTML or < 1.5 KB as blocked; reads `Spb-Cost` header for credits; distinguishes 401 and out-of-credits. `googleSearch(query)` via `/api/v1/store/google` (`country_code=in`, `nb_results=10`). `scrapingBeeUsage()` via `/api/v1/usage`.
- `html.ts` — cheerio reduction: keep JSON-LD (walk `@graph`, `itemListElement`, `subEvent` for `*Event`), visible text ≤ 22k chars, event links.
- `ticketmaster.ts` — Discovery v2, `countryCode=IN`, `classificationName=music`, `startDateTime=today`; presales whose name matches `/early|phase 1|presale|first release/` define early-bird status and deadline.
- `listings.ts` — Bengaluru pages every run (District music, BookMyShow music, AllEvents concerts); two other metros rotate per half-hour slot; overridable with `LISTING_URLS`.
- `deezer.ts` — `/search/artist?q=` for autocomplete and photos (only accept an exact-name photo).

## 7. Gemini extraction contract — `src/lib/extract/gemini.ts`

System prompt (keep these rules verbatim in spirit): only report what the content states; `matched_artist` only for watchlist acts (exact watchlist spelling); `is_tribute_or_cover` for tribute/cover/“music of”; `country="IN"` only when physically in India; `date` is the performance date; precise definitions for each `early_bird_status`; scarcity phrases; ticket URL rules; calibrated confidence; empty array when nothing qualifies. Include **today's IST date** and the **watchlist** in every call.

Response schema (all required, nullable where shown): `listed_artist, matched_artist?, title?, venue?, city?, country?, date?, time?, ticket_url?, price_min_inr?, early_bird_status(enum), early_bird_deadline?, scarcity_signals[], is_tribute_or_cover, confidence 0–1, evidence`. Validate with Zod; one repair retry on invalid JSON; exponential backoff on 429/503; clear error on bad key.

## 8. Candidate rules — `src/lib/pipeline/candidates.ts`

Drop: tributes, missing/past dates, missing city, non-India country, unknown city with no country. Artist decision:
- per-artist API result: our matcher must agree with score ≥ 0.85, else drop (API keyword search is loose);
- Gemini match + matcher agree → accept, confidence ≥ 0.85;
- Gemini only → accept, `needs_review` if confidence < 0.75;
- matcher only (≥ 0.93, not ambiguous) → accept, confidence ≤ 0.8;
- otherwise drop with a reason (shown in Live data).
Strip `utm_*`/`fbclid`/`gclid` from ticket URLs. Convert `date + HH:MM` IST to UTC.

## 9. Merge & alert rules — `src/lib/pipeline/merge.ts` (pure, unit-tested)

- New row → `new` alert unless `needs_review`; urgent if early bird open, deadline < 72 h, or scarcity.
- Existing row: venue change (stronger/equal source) → `changed` (quiet); early-bird → `available` → `early_bird_open` (urgent); never downgrade an open window on a weaker source's word; fill ticket URL/price/time/title; merge scarcity; keep max confidence; upgrade `best_source`.
- `needs_review` row confirmed by a non-review candidate → becomes a `new` alert.
- Reschedule: no row for the key but same artist + city + ticket URL with another future date → move the row, record a `starts_on` change, `changed` alert.
- `dedupeBatch` merges duplicates inside one job before touching the DB.
- Alerts upsert with `onConflict: dedupe_key, ignoreDuplicates: true`.

## 10. Runner — `src/lib/pipeline/runner.ts`

`startScan(trigger)`: RPC `start_scan`; if the run has no jobs, plan: listing jobs (priority 1 for Bengaluru), Ticketmaster per artist (2), Bandsintown (4), web search for favourites + stalest artists up to `SEARCH_BATCH` (2/5). Note in the run when no source is configured. Backfill up to 8 artist photos from Deezer.
`stepScan(runId, budgetMs)`: loop claim 3 → run in parallel → store → enqueue follow-ups (priority 6) → update job + `record_source`; heartbeat each loop; stop 12 s before budget. Job errors never fail the run; credit cap → `skipped`.
`progress(runId, finalize)`: recompute counters from tables; when nothing remains: deadline sweep (`deadline_soon` for windows ending < 24 h), dispatch alerts, set completed/partial/failed, notes.
Routes: `POST /api/scan/start` (60 s cooldown after a finished run), `POST /api/scan/step` (maxDuration 60), `GET /api/scan/[id]`, `GET /api/cron/scan` (Bearer or `?key=` CRON_SECRET; start/resume + one 52 s step).

## 11. Alerts — `src/lib/alerts/*`

One digest email per dispatch, ordered Bengaluru → urgent → soonest. Subject example: `EARLY BIRD OPEN: Khalid · Bengaluru · Tue 15 DEC (+2 more)`. Card per show: date stub, BENGALURU / URGENT pills, artist, venue · city · time, early-bird line with deadline and “Xd Yh left” in bold amber, scarcity in red, price, buttons (Get tickets · I'm going → calendar · Remind me · Add to Google Calendar), provenance line. Plain-text part too. Build RFC 2822 multipart/alternative, base64url, UTF-8 encoded subject. Gmail API if connected, else SMTP, else mark `in_app` with a helpful note. Failures retry up to 4 times.

Email buttons link to `/d?t=<signed token>&choice=…`; that page **requires a tap** (link scanners pre-open GETs).

## 12. Decisions & Calendar — `src/lib/decisions.ts`, `src/lib/google/*`

- `going` → calendar “{artist} live · {venue}” (timed 3 h if start time known, else all-day) with popups at 24 h and 3 h; plus “Early bird ends: …” 30-min event ending at the deadline if it is > 45 min away.
- `maybe` → only the reminder (deadline, or 7 days before the show at 19:00 IST).
- `skip` → hide and mute alerts (undo available).
- Calendar event id = `eb` + sha256(eventId:kind)[0:40] (hex ⊂ base32hex) → idempotent; on 409 fetch the existing event (restore if cancelled).
- Without Google: return a prefilled template URL; the client opens it in a tab it opened synchronously inside the click (popup-blocker safe).
- OAuth: signed `state` (10 min), require both scopes, store email, default alert email to it; `invalid_grant` clears the token and asks to reconnect.

## 13. UI/UX spec

Design language: “backstage pass”. Cool ink-and-paper neutrals, one stage-light blue accent (Bengaluru + primary actions), amber reserved **only** for early-bird state, red only for urgency. Light and dark themes via CSS variables. Display face Bricolage Grotesque, UI Geist, numbers tabular.

- **Header**: logo, nav (Shows · Artists · Alerts · Live data · Settings), live pill (“Live · scanned 12 min ago”, pulsing while running), **Scan now** button. Mobile: bottom tab bar, safe-area padding.
- **Scan now** opens a progress panel: progress bar, every check with spinner/✓/–/⚠, “found N” chips, notes; toasts the result and refreshes.
- **Shows (home)**: headline, setup checklist card (only while Gemini/ScrapingBee/Google are missing; dismissible), 4 stat tiles (Upcoming · In Bengaluru · Early birds open · Closing in 72 h), “You're going to…” chips, filters (city chips with counts, Early bird toggle, search), **In Bengaluru** section pinned, then **Across India · Month** sections. Within a section, early-bird windows closing within 72 h first, then by date.
- **Show card** = ticket stub: date stub (blue for Bengaluru) + perforation; badges (Bengaluru, Early bird open + live countdown, pulsing red when < 72 h, scarcity, New · 2 h ago, Unconfirmed); avatar, artist, venue · city · time, price; actions (Grab early bird / Get tickets, I'm going, Remind me, hide); provenance row “Live from BookMyShow · District · first seen 12 Oct, 3:41 pm IST”. Optimistic updates with undo.
- **Show detail**: card + “How we know” timeline (first detected by which scan, each source with link, every field change, every alert and delivery) + at-a-glance table incl. confidence and event key.
- **Artists**: autocomplete add (Deezer photos, keyboard navigation), paste list / CSV upload, filter, star favourites, remove with undo, “not watching” list to restore, upcoming count and last checked per artist.
- **Alerts**: history with kind, urgent/Bengaluru pills, delivery status (Emailed via Gmail at …, In app, Not delivered), “Email N unsent”.
- **Live data**: source health cards (requests and credits today, last OK, last error), ScrapingBee credits left, latest scan job table (result, found, credits), recent runs table.
- **Settings**: Step 1 Gmail + Calendar (Connect Google, test email, disconnect, alert email, daily credit cap), Step 2 sources & AI with status badges and Test buttons, Step 3 schedule with the cron URL.
- Empty, loading (skeletons), error (human hint + raw message) and 404 states everywhere. Visible focus rings, aria labels, `prefers-reduced-motion` respected, no horizontal scroll at 375 px.

## 14. Tests (must pass)

Vitest, ≥ 25 cases: city normalisation (Bangalore variants, NCR), artist matching (noise, aliases, typos, ambiguous short names, negatives), event keys, source detection, merge rules (new, urgent, held-back, no-op, early-bird flip, no weak downgrade, venue change, confirmation), batch dedupe, candidate filters (India-only, tribute, past date, loose API hit, weak LLM match → review).

## 15. Deploy

- `vercel.json`: region `bom1`, one daily cron `30 2 * * *` (08:00 IST — Hobby allows daily only). Document cron-job.org for 30-minute checks.
- Env vars: see `.env.example`. Set them in Vercel, redeploy, open `/api/health`.
- Smoke test in an incognito window: feed renders seeded shows; Settings tests pass; Scan now completes; digest arrives; I'm going creates calendar events.

## 16. Definition of done

- Public URL works with zero clicks of setup; seeded real shows visible, Bengaluru first.
- Scan now shows live progress and writes to Live data.
- With keys: new shows appear from ScrapingBee/Ticketmaster through Gemini; a digest email arrives via Gmail; I'm going adds calendar events.
- Without keys: nothing crashes; each missing piece explains itself in one sentence.
- README covers what, setup, env vars, architecture; Components Map in `docs/`.
