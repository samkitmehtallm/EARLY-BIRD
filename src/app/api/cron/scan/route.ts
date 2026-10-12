import { NextResponse } from "next/server";
import { env, has } from "@/lib/env";
import { startScan, stepScan } from "@/lib/pipeline/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by Vercel Cron (daily on Hobby) and by any external scheduler, e.g. cron-job.org
 * every 30 minutes with header `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`.
 * A run that does not finish in one call is resumed by the next call.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const ok = env.cronSecret && (auth === `Bearer ${env.cronSecret}` || url.searchParams.get("key") === env.cronSecret);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!has.db()) return NextResponse.json({ error: "database not configured" }, { status: 503 });

  const t0 = Date.now();
  try {
    const { run, resumed } = await startScan("cron");
    const p = await stepScan(run.id, 38_000 - (Date.now() - t0));
    return NextResponse.json({
      runId: run.id,
      resumed,
      status: p.run.status,
      remaining: p.remaining,
      new: p.run.events_new,
      changed: p.run.events_changed,
      ms: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
