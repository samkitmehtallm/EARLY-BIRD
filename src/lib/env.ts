/**
 * Environment access. Nothing here throws at import time: a missing key must never
 * break `next build` or a page render. Features check `has.*` and degrade with a
 * clear message instead.
 */

const read = (k: string) => {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export const env = {
  supabaseUrl: read("SUPABASE_URL") ?? read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  supabasePublishableKey: read("SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseAppSecret: read("SUPABASE_APP_SECRET"),

  geminiKey: read("GEMINI_API_KEY"),
  geminiModel: read("GEMINI_MODEL") ?? "gemini-flash-latest",

  scrapingBeeKey: read("SCRAPINGBEE_API_KEY"),
  ticketmasterKey: read("TICKETMASTER_API_KEY"),
  bandsintownAppId: read("BANDSINTOWN_APP_ID"),

  googleClientId: read("GOOGLE_CLIENT_ID"),
  googleClientSecret: read("GOOGLE_CLIENT_SECRET"),

  gmailSmtpUser: read("GMAIL_SMTP_USER"),
  gmailAppPassword: read("GMAIL_APP_PASSWORD"),
  alertEmailTo: read("ALERT_EMAIL_TO"),

  cronSecret: read("CRON_SECRET"),
  signingSecret: read("APP_SIGNING_SECRET") ?? read("CRON_SECRET") ?? "dev-only-signing-secret",
  tokenKey: read("TOKEN_ENCRYPTION_KEY"),
  searchBatch: Number(read("SEARCH_BATCH") ?? 10),
};

export function appUrl(): string {
  const explicit = read("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = read("VERCEL_PROJECT_PRODUCTION_URL");
  if (prod) return `https://${prod}`;
  const vercel = read("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const has = {
  db: () => Boolean(env.supabaseUrl && (env.supabaseServiceKey || (env.supabasePublishableKey && env.supabaseAppSecret))),
  gemini: () => Boolean(env.geminiKey),
  scrapingBee: () => Boolean(env.scrapingBeeKey),
  ticketmaster: () => Boolean(env.ticketmasterKey),
  bandsintown: () => Boolean(env.bandsintownAppId),
  googleOAuth: () => Boolean(env.googleClientId && env.googleClientSecret && env.tokenKey),
  smtp: () => Boolean(env.gmailSmtpUser && env.gmailAppPassword),
};

export class NotConfiguredError extends Error {
  constructor(public integration: string, message?: string) {
    super(message ?? `${integration} is not configured yet. Add its key in Vercel → Settings → Environment Variables.`);
    this.name = "NotConfiguredError";
  }
}
