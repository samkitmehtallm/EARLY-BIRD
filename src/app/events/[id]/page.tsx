import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { has } from "@/lib/env";
import { SOURCE_LABEL } from "@/lib/normalize";
import { getEvent } from "@/lib/queries";
import { formatDateTime, formatDay, formatTime } from "@/lib/time";
import { EventCard } from "@/components/event-card";
import { SetupScreen } from "@/components/setup-screen";
import { Badge, Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Show" };

const FIELD: Record<string, string> = {
  venue: "Venue",
  early_bird_status: "Early bird",
  early_bird_deadline: "Early-bird deadline",
  starts_on: "Date",
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  if (!has.db()) return <SetupScreen />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getEvent(id);
  if (!data) notFound();
  const { event: e, changes, alerts, firstRun } = data;

  const timeline = [
    { at: e.first_seen_at, title: "First detected", body: `Picked up by a ${firstRun?.trigger ?? "scheduled"} scan${firstRun ? ` that started ${formatTime(firstRun.started_at)}` : ""}.` },
    ...e.sources.map((s) => ({ at: s.first_seen_at, title: `Seen on ${SOURCE_LABEL[s.source] ?? s.source}`, body: s.url, href: s.url })),
    ...changes.map((c) => ({
      at: c.created_at,
      title: `${FIELD[c.field] ?? c.field} changed`,
      body: `${fmt(c.old_value)} → ${fmt(c.new_value)}`,
    })),
    ...alerts.map((a) => ({
      at: a.created_at,
      title: a.status === "sent" ? "Alert emailed" : "Alert raised",
      body: `${a.summary}${a.sent_at ? ` · delivered ${formatTime(a.sent_at)}` : ""}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> All shows
      </Link>
      <EventCard e={e} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="flex flex-col gap-3">
          <SectionTitle eyebrow="Provenance" title="How we know" />
          <Card className="p-5">
            <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
                  <div className="tabular text-xs text-muted">{formatDateTime(t.at)} IST</div>
                  <div className="font-semibold">{t.title}</div>
                  {"href" in t && t.href ? (
                    <a href={t.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-sm text-accent hover:underline">
                      <span className="truncate">{t.body}</span> <ExternalLink size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <div className="text-sm text-ink-2">{t.body}</div>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </section>

        <aside className="flex flex-col gap-3">
          <SectionTitle eyebrow="Details" title="At a glance" />
          <Card className="divide-y divide-line text-sm">
            <Row k="Date" v={formatDay(e.starts_on).long} />
            <Row k="Time" v={e.starts_at ? formatTime(e.starts_at) : "Not announced"} />
            <Row k="Venue" v={e.venue ?? "Not announced"} />
            <Row k="City" v={e.city} />
            <Row k="Price from" v={e.price_min_inr ? `₹${e.price_min_inr.toLocaleString("en-IN")}` : "—"} />
            <Row k="Early bird" v={e.early_bird_status.replace("_", " ")} />
            {e.early_bird_deadline && <Row k="Early bird ends" v={`${formatDateTime(e.early_bird_deadline)} IST`} />}
            <Row k="Confidence" v={<Badge tone={e.confidence >= 0.8 ? "ok" : e.confidence >= 0.6 ? "eb" : "urgent"}>{Math.round(e.confidence * 100)}%</Badge>} />
            <Row k="Event key" v={<code className="text-xs break-all">{e.event_key}</code>} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium capitalize">{v}</span>
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  return String(v).replace("_", " ");
}
