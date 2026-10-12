import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDot, ExternalLink } from "lucide-react";
import { appUrl, has } from "@/lib/env";
import { getSettings, integrations, type IntegrationStatus } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";
import { ErrorPanel } from "@/components/error-panel";
import { DisconnectGoogle, SettingsForm, TestButton } from "@/components/settings-forms";
import { SetupScreen } from "@/components/setup-screen";
import { Badge, buttonClass, Card, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const STATE = {
  connected: { tone: "ok", label: "Connected", icon: CheckCircle2 },
  action: { tone: "accent", label: "One click left", icon: CircleDot },
  optional: { tone: "neutral", label: "Optional", icon: CircleDot },
  needs_key: { tone: "eb", label: "Needs key", icon: CircleAlert },
} as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  if (!has.db()) return <SetupScreen />;
  const sp = await searchParams;
  let ints: IntegrationStatus[], settings;
  try {
    [ints, settings] = await Promise.all([integrations(), getSettings()]);
  } catch (e) {
    return <ErrorPanel message={(e as Error).message} />;
  }
  const google = ints.find((i) => i.id === "google")!;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" lede="Connect the services Early Bird uses. Anything not connected yet is skipped quietly — the rest keeps working." />

      {sp.connected && (
        <div className="rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">
          Google connected as <b>{sp.connected}</b>. Alerts will come from your Gmail, and “I&apos;m going” books straight into your calendar.
        </div>
      )}
      {sp.error && <div className="rounded-xl border border-urgent/30 bg-urgent-soft px-4 py-3 text-sm text-urgent">{sp.error}</div>}

      <section className="flex flex-col gap-3">
        <SectionTitle eyebrow="Step 1" title="Email and calendar" />
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                Gmail + Google Calendar <StateBadge s={google.state} />
              </div>
              <p className="mt-1 max-w-xl text-sm text-muted">
                One Google sign-in lets Early Bird email you from your own Gmail and add the shows you pick — plus an early-bird deadline reminder — to your calendar.
                We ask only for “send email” and “edit calendar events”, never to read your inbox.
              </p>
              {settings.google_email && (
                <p className="mt-2 text-sm">
                  Connected as <b>{settings.google_email}</b>
                  {settings.google_connected_at ? <span className="text-muted"> · since {formatDateTime(settings.google_connected_at)}</span> : null}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {google.state === "connected" ? (
                <>
                  <TestButton kind="email" />
                  <DisconnectGoogle />
                </>
              ) : has.googleOAuth() ? (
                <a href="/api/google/connect" className={buttonClass("primary", "md")}>
                  <GoogleMark /> Connect Google
                </a>
              ) : (
                <>
                  {has.smtp() && <TestButton kind="email" />}
                  <Badge tone="eb">Add GOOGLE_CLIENT_ID + SECRET to enable</Badge>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-line pt-4">
            <SettingsForm alertEmail={settings.alert_email} cap={settings.daily_credit_cap} />
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle eyebrow="Step 2" title="Data sources and AI" />
        <div className="grid gap-3 md:grid-cols-2">
          {ints
            .filter((i) => i.id !== "google")
            .map((i) => (
              <Card key={i.id} className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-2 font-semibold">
                  {i.name} <StateBadge s={i.state} />
                </div>
                <p className="text-sm text-muted">{i.role}</p>
                <p className="text-xs text-ink-2">{i.detail}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {i.id === "gemini" && <TestButton kind="gemini" disabled={i.state !== "connected"} />}
                  {i.id === "scrapingbee" && <TestButton kind="scrapingbee" disabled={i.state !== "connected"} />}
                  {i.state !== "connected" && i.envVars.length > 0 && (
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{i.envVars.join(", ")}</code>
                  )}
                </div>
              </Card>
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle eyebrow="Step 3" title="Automatic checks" />
        <Card className="p-5 text-sm text-ink-2">
          <p>
            Vercel runs a scan every morning. For checks every 30 minutes, point a free scheduler such as cron-job.org at this address with your
            <code className="mx-1 rounded bg-surface-2 px-1">CRON_SECRET</code>:
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs">{appUrl()}/api/cron/scan?key=YOUR_CRON_SECRET</code>
          <p className="mt-3 text-muted">
            You can always press <b>Scan now</b> at the top. Runs that need more time pick up where they left off.{" "}
            <Link href="/activity" className="inline-flex items-center gap-1 text-accent hover:underline">
              See the live data log <ExternalLink size={12} />
            </Link>
          </p>
        </Card>
      </section>
    </div>
  );
}

function StateBadge({ s }: { s: IntegrationStatus["state"] }) {
  const { tone, label, icon: Icon } = STATE[s];
  return (
    <Badge tone={tone}>
      <Icon size={11} /> {label}
    </Badge>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
