import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, Mail, Smartphone } from "lucide-react";
import { has } from "@/lib/env";
import { getAlerts } from "@/lib/queries";
import { formatDateTime, formatDay } from "@/lib/time";
import { ErrorPanel } from "@/components/error-panel";
import { RetryAlertsButton } from "@/components/settings-forms";
import { SetupScreen } from "@/components/setup-screen";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts" };

const KIND = { new: "Just announced", early_bird_open: "Early bird opened", deadline_soon: "Early bird closing", changed: "Changed" } as const;

export default async function AlertsPage() {
  if (!has.db()) return <SetupScreen />;
  let alerts;
  try {
    alerts = await getAlerts();
  } catch (e) {
    return <ErrorPanel message={(e as Error).message} />;
  }
  const unsent = alerts.filter((a) => a.status === "failed" || (a.status === "in_app" && a.channel !== "muted")).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alert history"
        lede="Every alert Early Bird raised, when, and how it reached you. Each email bundles everything found in one scan, Bengaluru first."
        right={unsent > 0 ? <RetryAlertsButton count={unsent} /> : null}
      />
      {!alerts.length ? (
        <Empty icon={<BellOff size={28} />} title="No alerts yet" body="When a scan finds a new show, an early-bird window opening, or a deadline closing, it appears here and in your inbox." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {alerts.map((a) => {
            const d = formatDay(a.event.starts_on);
            return (
              <Link key={a.id} href={`/events/${a.event.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:gap-4 sm:px-5">
                <Avatar name={a.event.artist.name} src={a.event.artist.image_url} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{KIND[a.kind]}</span>
                    {a.urgent && <Badge tone="urgent">Urgent</Badge>}
                    {a.event.is_bengaluru && <Badge tone="accent">Bengaluru</Badge>}
                  </div>
                  <div className="truncate font-medium">{a.summary}</div>
                  <div className="tabular text-xs text-muted">
                    Raised {formatDateTime(a.created_at)} IST · show {d.weekday} {d.day} {d.month}
                  </div>
                </div>
                <Delivery status={a.status} channel={a.channel} sentAt={a.sent_at} error={a.error} />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function Delivery({ status, channel, sentAt, error }: { status: string; channel: string | null; sentAt: string | null; error: string | null }) {
  if (status === "sent")
    return (
      <span className="flex shrink-0 flex-col items-end text-right text-xs">
        <Badge tone="ok">
          <Mail size={11} /> Emailed
        </Badge>
        <span className="tabular mt-0.5 hidden text-muted sm:block">
          {channel === "gmail" ? "Gmail" : "SMTP"} · {sentAt ? formatDateTime(sentAt) : ""}
        </span>
      </span>
    );
  if (status === "pending") return <Badge tone="eb">Sending…</Badge>;
  if (status === "failed")
    return (
      <span title={error ?? ""}>
        <Badge tone="urgent">Not delivered</Badge>
      </span>
    );
  if (channel === "muted") return <Badge>Muted</Badge>;
  return (
    <Badge tone="neutral" title="Email isn't connected — shown in the app only">
      <Smartphone size={11} /> In app
    </Badge>
  );
}
