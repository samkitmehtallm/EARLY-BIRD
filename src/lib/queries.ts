import "server-only";
import { db, must } from "./db";
import { env, has } from "./env";
import { isGoogleConnected } from "./google/oauth";
import { istDate } from "./time";
import type { AlertRow, Artist, FeedEvent, ScanJob, ScanRun, Settings } from "./types";

export async function getFeed(): Promise<FeedEvent[]> {
  const rows = must(
    await db()
      .from("events")
      .select("*, artist:artists!inner(id,name,slug,image_url,tier), sources:event_sources(source,url,first_seen_at,last_seen_at)")
      .eq("status", "active")
      .gte("starts_on", istDate())
      .order("is_bengaluru", { ascending: false })
      .order("starts_on", { ascending: true })
      .limit(400),
    "load feed",
  ) as FeedEvent[];
  return rows;
}

export async function getEvent(id: string) {
  const supa = db();
  const ev = must(
    await supa
      .from("events")
      .select("*, artist:artists!inner(id,name,slug,image_url,tier), sources:event_sources(source,url,first_seen_at,last_seen_at)")
      .eq("id", id)
      .maybeSingle(),
    "load event",
  ) as FeedEvent | null;
  if (!ev) return null;
  const [changes, alerts, run] = await Promise.all([
    supa.from("event_changes").select("*").eq("event_id", id).order("created_at", { ascending: false }).limit(50),
    supa.from("alerts").select("*").eq("event_id", id).order("created_at", { ascending: false }),
    ev.first_seen_run_id ? supa.from("scan_runs").select("*").eq("id", ev.first_seen_run_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    event: ev,
    changes: (changes.data ?? []) as { id: string; field: string; old_value: unknown; new_value: unknown; created_at: string }[],
    alerts: (alerts.data ?? []) as AlertRow[],
    firstRun: (run.data ?? null) as ScanRun | null,
  };
}

export async function getArtists() {
  const supa = db();
  const [artists, counts] = await Promise.all([
    supa.from("artists").select("*").order("tier", { ascending: false }).order("name"),
    supa.from("events").select("artist_id").eq("status", "active").gte("starts_on", istDate()),
  ]);
  const byArtist = new Map<string, number>();
  for (const r of (counts.data ?? []) as { artist_id: string }[]) byArtist.set(r.artist_id, (byArtist.get(r.artist_id) ?? 0) + 1);
  return (must(artists, "load artists") as Artist[]).map((a) => ({ ...a, upcoming: byArtist.get(a.id) ?? 0 }));
}

export async function getAlerts() {
  return must(
    await db()
      .from("alerts")
      .select("*, event:events!inner(id,city,starts_on,is_bengaluru,artist:artists!inner(name,image_url))")
      .order("created_at", { ascending: false })
      .limit(150),
    "load alerts",
  ) as (AlertRow & { event: { id: string; city: string; starts_on: string; is_bengaluru: boolean; artist: { name: string; image_url: string | null } } })[];
}

export async function getLatestRun(): Promise<ScanRun | null> {
  const { data } = await db().from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data as ScanRun) ?? null;
}

export async function getActivity() {
  const supa = db();
  const [runs, health] = await Promise.all([
    supa.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(20),
    supa.from("source_health").select("*").order("source"),
  ]);
  const runList = (runs.data ?? []) as ScanRun[];
  const latest = runList[0];
  const jobs = latest
    ? ((await supa.from("scan_jobs").select("*").eq("run_id", latest.id).order("priority").order("created_at")).data ?? [])
    : [];
  return {
    runs: runList,
    jobs: jobs as ScanJob[],
    health: (health.data ?? []) as {
      source: string; last_ok_at: string | null; last_error_at: string | null; last_error: string | null;
      consecutive_failures: number; requests_today: number; credits_today: number; day: string;
    }[],
  };
}

export async function getSettings(): Promise<Settings> {
  return must(await db().from("settings").select("*").eq("id", 1).single(), "load settings") as Settings;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  role: string;
  state: "connected" | "needs_key" | "optional" | "action";
  detail: string;
  envVars: string[];
}

export async function integrations(): Promise<IntegrationStatus[]> {
  const google = has.googleOAuth() && has.db() ? await isGoogleConnected().catch(() => false) : false;
  return [
    {
      id: "supabase", name: "Supabase", role: "Stores artists, shows, alerts and scan history",
      state: has.db() ? "connected" : "needs_key", detail: has.db() ? "Database reachable" : "Add the Supabase URL and key",
      envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    },
    {
      id: "gemini", name: "Gemini Flash", role: "Reads messy pages into clean show data, matches artist names, filters non-India shows",
      state: has.gemini() ? "connected" : "needs_key", detail: has.gemini() ? `Model ${env.geminiModel}` : "Add GEMINI_API_KEY", envVars: ["GEMINI_API_KEY"],
    },
    {
      id: "scrapingbee", name: "ScrapingBee", role: "Loads BookMyShow, District and AllEvents pages and runs Google searches from India",
      state: has.scrapingBee() ? "connected" : "needs_key", detail: has.scrapingBee() ? "Rendering with Indian proxies" : "Add SCRAPINGBEE_API_KEY", envVars: ["SCRAPINGBEE_API_KEY"],
    },
    {
      id: "ticketmaster", name: "Ticketmaster Discovery", role: "Official listings API for international tours",
      state: has.ticketmaster() ? "connected" : "optional", detail: has.ticketmaster() ? "Searching India, music only" : "Optional — free key at developer.ticketmaster.com",
      envVars: ["TICKETMASTER_API_KEY"],
    },
    {
      id: "google", name: "Gmail + Google Calendar", role: "Sends alert emails from your Gmail and books shows into your calendar",
      state: google ? "connected" : has.googleOAuth() ? "action" : has.smtp() ? "optional" : "needs_key",
      detail: google ? "Connected" : has.googleOAuth() ? "Click Connect Google" : has.smtp() ? "Email via Gmail SMTP; calendar uses prefilled links" : "Add Google OAuth client keys",
      envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"],
    },
    {
      id: "deezer", name: "Deezer", role: "Artist search and photos", state: "connected", detail: "Public API, no key needed", envVars: [],
    },
  ];
}
