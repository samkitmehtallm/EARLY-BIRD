import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { authUrl } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.redirect(authUrl());
  } catch (e) {
    return NextResponse.redirect(`${appUrl()}/settings?error=${encodeURIComponent((e as Error).message)}`);
  }
}
