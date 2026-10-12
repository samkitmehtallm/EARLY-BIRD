import { NextResponse } from "next/server";
import { searchArtists } from "@/lib/sources/deezer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchArtists(q.slice(0, 80)) });
}
