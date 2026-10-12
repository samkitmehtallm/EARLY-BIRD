import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { decide } from "@/lib/decisions";
import type { Decision } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OK = new Set<Decision>(["going", "maybe", "skip", "undecided"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { eventId?: string; decision?: Decision };
  if (!body.eventId || !body.decision || !OK.has(body.decision)) {
    return NextResponse.json({ error: "eventId and a valid decision are required" }, { status: 400 });
  }
  try {
    const res = await decide(body.eventId, body.decision);
    revalidatePath("/");
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
