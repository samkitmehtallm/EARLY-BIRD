import "server-only";
import { decrypt, encrypt, signToken, verifyToken } from "../crypto";
import { db, must } from "../db";
import { appUrl, env, has, NotConfiguredError } from "../env";
import { fetchWithTimeout } from "../sources/http";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

export const redirectUri = () => `${appUrl()}/api/google/callback`;

export function authUrl(): string {
  if (!has.googleOAuth()) throw new NotConfiguredError("Google sign-in", "Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY to connect Gmail and Calendar.");
  const params = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signToken({ purpose: "google-oauth" }, 600),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleCallback(code: string, state: string): Promise<string> {
  const st = verifyToken<{ purpose: string }>(state);
  if (!st || st.purpose !== "google-oauth") throw new Error("The sign-in link expired. Try Connect Google again.");

  const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tok = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error_description?: string; scope?: string };
  if (!tokenRes.ok || !tok.access_token) throw new Error(tok.error_description ?? "Google did not return a token.");
  if (!tok.refresh_token) throw new Error("Google did not return a refresh token. Remove Early Bird from myaccount.google.com/permissions and connect again.");

  const scopes = tok.scope ?? "";
  const missing = ["gmail.send", "calendar.events"].filter((s) => !scopes.includes(s));
  if (missing.length) throw new Error(`Please tick every permission on Google's screen (missing: ${missing.join(", ")}).`);

  const me = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${tok.access_token}` } });
  const profile = (await me.json()) as { email?: string };
  const email = profile.email ?? null;

  const current = must(await db().from("settings").select("alert_email").eq("id", 1).single(), "load settings") as { alert_email: string | null };
  must(
    await db()
      .from("settings")
      .update({
        google_email: email,
        google_refresh_token_enc: encrypt(tok.refresh_token),
        google_connected_at: new Date().toISOString(),
        alert_email: current.alert_email ?? email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1),
    "save Google connection",
  );
  cached = { token: tok.access_token, exp: Date.now() + 50 * 60_000 };
  return email ?? "your Google account";
}

let cached: { token: string; exp: number } | null = null;

export async function isGoogleConnected(): Promise<boolean> {
  if (!has.googleOAuth() || !has.db()) return false;
  const { data } = await db().from("settings").select("google_refresh_token_enc").eq("id", 1).maybeSingle();
  return Boolean(data?.google_refresh_token_enc);
}

/** Short-lived access token from the stored refresh token. Cached per server instance. */
export async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  if (!has.googleOAuth()) throw new NotConfiguredError("Google sign-in");
  const row = must(await db().from("settings").select("google_refresh_token_enc").eq("id", 1).single(), "load Google token") as {
    google_refresh_token_enc: string | null;
  };
  if (!row.google_refresh_token_enc) throw new NotConfiguredError("Google", "Connect Google in Settings to send email and add calendar events.");

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      refresh_token: decrypt(row.google_refresh_token_enc),
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) {
    if (j.error === "invalid_grant") {
      await db().from("settings").update({ google_refresh_token_enc: null }).eq("id", 1);
      throw new NotConfiguredError("Google", "Google access expired or was revoked. Reconnect Google in Settings.");
    }
    throw new Error(`Google token refresh failed (${j.error ?? res.status}).`);
  }
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

export async function disconnectGoogle() {
  cached = null;
  await db().from("settings").update({ google_refresh_token_enc: null, google_email: null, google_connected_at: null }).eq("id", 1);
}
