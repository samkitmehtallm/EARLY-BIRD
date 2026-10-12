import { NextResponse } from "next/server";
import { has } from "@/lib/env";
import { startScan } from "@/lib/pipeline/runner";
import { getLatestRun } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MIN_GAP_MS = 60_000;

export async function POST() {
  if (!has.db()) return NextResponse.json({ error: "Connect Supabase first (see Settings)." }, { status: 503 });
  try {
    const last = await getLatestRun();
    if (last && last.status !== "running" && last.finished_at && Date.now() - Date.parse(last.finished_at) < MIN_GAP_MS) {
      return NextResponse.json({ runId: last.id, resumed: true, cooldown: true });
    }
    const { run, resumed } = await startScan("manual");
    return NextResponse.json({ runId: run.id, resumed, jobs: run.jobs_total, notes: run.notes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
