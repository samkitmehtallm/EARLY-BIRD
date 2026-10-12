import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { has } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "not configured";
  if (has.db()) {
    const { error } = await db().from("settings").select("id").limit(1);
    database = error ? `error: ${error.message}` : "ok";
  }
  return NextResponse.json({
    ok: database === "ok",
    database,
    gemini: has.gemini(),
    scrapingBee: has.scrapingBee(),
    ticketmaster: has.ticketmaster(),
    googleOAuth: has.googleOAuth(),
    time: new Date().toISOString(),
  });
}
