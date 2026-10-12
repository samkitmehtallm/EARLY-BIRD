import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { handleCallback } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) return NextResponse.redirect(`${appUrl()}/settings?error=${encodeURIComponent(err === "access_denied" ? "Google access was not granted." : err)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${appUrl()}/settings?error=${encodeURIComponent("Missing code from Google.")}`);
  try {
    const email = await handleCallback(code, state);
    return NextResponse.redirect(`${appUrl()}/settings?connected=${encodeURIComponent(email)}`);
  } catch (e) {
    return NextResponse.redirect(`${appUrl()}/settings?error=${encodeURIComponent((e as Error).message)}`);
  }
}
