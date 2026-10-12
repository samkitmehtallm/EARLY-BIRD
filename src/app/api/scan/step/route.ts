import { NextResponse } from "next/server";
import { stepScan } from "@/lib/pipeline/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  try {
    return NextResponse.json(await stepScan(runId, 38_000));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
