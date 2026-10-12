import "server-only";
import { dispatchAlerts, sweepDeadlines } from "../alerts/dispatch";
import { db, must } from "../db";
import { env } from "../env";
import { artistImage } from "../sources/deezer";
import { pagesForThisRun } from "../sources/listings";
import type { Artist, ScanJob, ScanRun, Settings } from "../types";
import { runJob, sourcesConfigured, type JobContext } from "./jobs";
import { storeCandidates } from "./store";

const CLAIM_BATCH = 3;
// A claimed job may spend up to MAX_FETCH_MS (32s) on one request plus a Gemini call,
// so a new batch is only worth starting when that much time is left.
const SAFETY_MS = 20_000;

export interface ScanProgress {
  run: ScanRun;
  jobs: Pick<ScanJob, "id" | "kind" | "label" | "status" | "found" | "error">[];
  done: boolean;
  remaining: number;
}

async function loadArtists(): Promise<Artist[]> {
  return must(
    await db().from("artists").select("*").eq("is_active", true).order("tier", { ascending: false }).order("last_checked_at", { ascending: true, nullsFirst: true }),
    "load artists",
  ) as Artist[];
}

async function settings(): Promise<Settings> {
  return must(await db().from("settings").select("*").eq("id", 1).single(), "load settings") as Settings;
}

/** Starts a scan, or returns the one already running so two clicks never double-spend credits. */
export async function startScan(trigger: ScanRun["trigger"]): Promise<{ run: ScanRun; resumed: boolean }> {
  const run = must(await db().rpc("start_scan", { p_trigger: trigger }).single(), "start scan") as ScanRun;
  const { count } = await db().from("scan_jobs").select("id", { count: "exact", head: true }).eq("run_id", run.id);
  if ((count ?? 0) > 0) return { run, resumed: true };

  const artists = await loadArtists();
  const src = sourcesConfigured();
  const jobs: Partial<ScanJob>[] = [];
  const notes: string[] = [];

  if (src.web) {
    for (const page of pagesForThisRun()) {
      jobs.push({ kind: "listing", label: page.label, payload: { url: page.url, label: page.label }, priority: page.everyRun ? 1 : 3 });
    }
  }
  if (src.ticketmaster) {
    for (const a of artists) jobs.push({ kind: "ticketmaster", label: `Ticketmaster · ${a.name}`, payload: { artistId: a.id, name: a.name }, priority: 2 });
  }
  if (src.bandsintown) {
    for (const a of artists) jobs.push({ kind: "bandsintown", label: `Bandsintown · ${a.name}`, payload: { artistId: a.id, name: a.name }, priority: 4 });
  }
  if (src.web) {
    const priority = artists.filter((a) => a.tier === "priority");
    const rest = artists.filter((a) => a.tier !== "priority");
    const budget = Math.max(env.searchBatch, priority.length);
    const chosen = [...priority, ...rest].slice(0, budget);
    for (const a of chosen) {
      jobs.push({
        kind: "search",
        label: `Web search · ${a.name}`,
        payload: { artistId: a.id, name: a.name, query: `"${a.name}" concert India tickets` },
        priority: a.tier === "priority" ? 2 : 5,
      });
    }
    if (rest.length > budget - priority.length) notes.push(`Web search covers ${chosen.length} artists per run, oldest-checked first.`);
  }
  if (!jobs.length) {
    notes.push("No data source is connected yet. Add a ScrapingBee + Gemini key or a Ticketmaster key in Settings.");
  }

  if (jobs.length) {
    must(await db().from("scan_jobs").insert(jobs.map((j) => ({ ...j, run_id: run.id }))), "plan jobs");
  }
  must(await db().from("scan_runs").update({ jobs_total: jobs.length, notes }).eq("id", run.id), "plan run");

  // Keyless nicety: fill in artist photos a few at a time.
  void backfillImages(artists).catch(() => {});

  return { run: { ...run, jobs_total: jobs.length, notes }, resumed: false };
}

async function backfillImages(artists: Artist[]) {
  const missing = artists.filter((a) => !a.image_url).slice(0, 8);
  await Promise.all(
    missing.map(async (a) => {
      const url = await artistImage(a.name);
      if (url) await db().from("artists").update({ image_url: url }).eq("id", a.id);
    }),
  );
}

/**
 * Processes jobs until the time budget runs out. Safe to call repeatedly and from
 * several places (browser loop, cron): jobs are claimed atomically in Postgres.
 */
export async function stepScan(runId: string, budgetMs: number): Promise<ScanProgress> {
  const started = Date.now();
  const deadlineMs = started + budgetMs;
  const [artists, s] = await Promise.all([loadArtists(), settings()]);
  const ctx: JobContext = { runId, artists, deadlineMs, creditCap: s.daily_credit_cap };

  while (Date.now() < deadlineMs - SAFETY_MS) {
    const claimed = must(await db().rpc("claim_jobs", { p_run: runId, p_limit: CLAIM_BATCH }), "claim jobs") as ScanJob[];
    if (!claimed.length) break;
    await Promise.all(claimed.map((job) => handle(job, ctx)));
    await db().from("scan_runs").update({ heartbeat_at: new Date().toISOString() }).eq("id", runId);
  }
  return progress(runId, true);
}

async function handle(job: ScanJob, ctx: JobContext) {
  const supa = db();
  try {
    const out = await runJob(job, ctx);
    const stored = out.candidates.length ? await storeCandidates(out.candidates, ctx.runId) : { inserted: 0, changed: 0, alerts: 0 };
    if (out.followUps.length) {
      await supa.from("scan_jobs").insert(
        out.followUps.map((f) => ({
          run_id: ctx.runId,
          kind: "page",
          label: `Page · ${f.label}`,
          payload: { url: f.url, label: f.label, artistId: f.artistId },
          priority: 6,
        })),
      );
    }
    await supa
      .from("scan_jobs")
      .update({
        status: "done",
        credits: out.credits,
        found: out.candidates.length,
        error: out.candidates.length ? null : out.dropped.slice(0, 3).join("; ") || null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await supa.rpc("record_source", { p_source: out.healthSource, p_ok: true, p_credits: out.credits, p_error: null });
    void stored;
  } catch (e) {
    const err = e as Error & { credits?: number; skip?: boolean; integration?: string };
    const message = err.message.slice(0, 400);
    await supa
      .from("scan_jobs")
      .update({ status: err.skip ? "skipped" : "failed", error: message, credits: err.credits ?? 0, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    if (!err.skip) {
      const src = job.kind === "search" ? "google-search" : job.kind === "listing" || job.kind === "page" ? hostOf(job) : job.kind;
      await supa.rpc("record_source", { p_source: src, p_ok: false, p_credits: err.credits ?? 0, p_error: message });
    }
  }
}

function hostOf(job: ScanJob) {
  try {
    return new URL(String((job.payload as { url?: string }).url)).hostname.replace(/^www\.|^in\./, "").split(".")[0];
  } catch {
    return "web";
  }
}

/** Recomputes run counters from the jobs table, and finalises the run once nothing is left. */
export async function progress(runId: string, finalize = false): Promise<ScanProgress> {
  const supa = db();
  const jobs = must(
    await supa.from("scan_jobs").select("id,kind,label,status,found,error,credits").eq("run_id", runId).order("priority").order("created_at"),
    "load jobs",
  ) as (ScanJob & { credits: number })[];
  const remaining = jobs.filter((j) => j.status === "pending" || j.status === "running").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const doneCount = jobs.length - remaining;

  const [{ count: newCount }, changed] = await Promise.all([
    supa.from("events").select("id", { count: "exact", head: true }).eq("first_seen_run_id", runId),
    supa.from("event_changes").select("event_id").eq("run_id", runId),
  ]);
  const changedCount = new Set((changed.data ?? []).map((r: { event_id: string }) => r.event_id)).size;

  const patch: Partial<ScanRun> = {
    jobs_total: jobs.length,
    jobs_done: doneCount,
    jobs_failed: failed,
    events_new: newCount ?? 0,
    events_changed: changedCount,
    credits_used: jobs.reduce((n, j) => n + (j.credits ?? 0), 0),
    heartbeat_at: new Date().toISOString(),
  };

  let run = must(await supa.from("scan_runs").select("*").eq("id", runId).single(), "load run") as ScanRun;
  const finishing = finalize && remaining === 0 && run.status === "running";
  if (finishing) {
    const notes = [...run.notes];
    try {
      const swept = await sweepDeadlines(runId);
      if (swept) notes.push(`${swept} early-bird deadline${swept === 1 ? "" : "s"} closing within 24h.`);
    } catch (e) {
      notes.push(`Deadline check failed: ${(e as Error).message}`);
    }
    try {
      const sent = await dispatchAlerts();
      if (sent.message) notes.push(sent.message);
    } catch (e) {
      notes.push(`Alert delivery failed: ${(e as Error).message}`);
    }
    patch.status = jobs.length > 0 && failed === jobs.length ? "failed" : failed > 0 ? "partial" : "completed";
    patch.finished_at = new Date().toISOString();
    patch.notes = notes;
  }
  run = must(await supa.from("scan_runs").update(patch).eq("id", runId).select("*").single(), "update run") as ScanRun;

  return {
    run,
    jobs: jobs.map(({ id, kind, label, status, found, error }) => ({ id, kind, label, status, found, error })),
    done: run.status !== "running",
    remaining,
  };
}
