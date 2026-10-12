"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { BellRing, CalendarCheck2, CalendarPlus, EyeOff, Flame, MapPin, Ticket, Undo2 } from "lucide-react";
import { SOURCE_LABEL } from "@/lib/normalize";
import { formatDateTime, formatDay, formatTime, hoursUntil, timeAgo } from "@/lib/time";
import type { Decision, FeedEvent } from "@/lib/types";
import { Countdown } from "./countdown";
import { Avatar, Badge, Button, buttonClass, cn } from "./ui";

export function EarlyBirdBadge({ e }: { e: Pick<FeedEvent, "early_bird_status" | "early_bird_deadline"> }) {
  if (e.early_bird_status === "available") {
    const closing = e.early_bird_deadline && hoursUntil(e.early_bird_deadline) < 72;
    return (
      <Badge tone={closing ? "urgent" : "eb"} className={cn(closing && "pulse")} title={e.early_bird_deadline ? `Ends ${formatDateTime(e.early_bird_deadline)} IST` : undefined}>
        <Flame size={12} />
        Early bird open
        {e.early_bird_deadline && <Countdown to={e.early_bird_deadline} prefix=" · " />}
      </Badge>
    );
  }
  if (e.early_bird_status === "upcoming")
    return (
      <Badge tone="eb">
        <BellRing size={12} /> Early bird soon
      </Badge>
    );
  if (e.early_bird_status === "sold_out") return <Badge tone="neutral">Early bird sold out</Badge>;
  return null;
}

export function EventCard({ e, index = 0, googleConnected = false }: { e: FeedEvent; index?: number; googleConnected?: boolean }) {
  const [decision, setDecision] = useState<Decision>(e.decision);
  const [busy, setBusy] = useState<Decision | null>(null);
  const d = formatDay(e.starts_on);
  const isNew = Date.now() - Date.parse(e.first_seen_at) < 36 * 3600_000;
  const sources = dedupeSources(e.sources);

  async function choose(next: Decision) {
    const prev = decision;
    setBusy(next);
    setDecision(next);
    // Open the calendar tab synchronously (inside the click) so popup blockers allow it.
    // Without a Google connection we hand off to a prefilled Google Calendar page instead.
    const pending = !googleConnected && (next === "going" || next === "maybe") ? window.open("about:blank", "_blank") : null;
    try {
      const r = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId: e.id, decision: next }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save.");
      if (j.templateUrl && pending) pending.location.href = j.templateUrl;
      else pending?.close();
      const calLink: string | undefined = next === "going" ? j.calendarLinks?.show : next === "maybe" ? j.calendarLinks?.earlybird ?? j.calendarLinks?.reminder : undefined;
      toast.success(j.message, {
        action:
          next === "skip"
            ? { label: "Undo", onClick: () => choose("undecided") }
            : calLink
              ? { label: "Open calendar", onClick: () => window.open(calLink, "_blank", "noopener") }
              : undefined,
      });
    } catch (err) {
      pending?.close();
      setDecision(prev);
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (decision === "skip") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        <span className="truncate">
          Hidden: {e.artist.name} · {e.city} · {d.long}
        </span>
        <Button size="sm" variant="ghost" onClick={() => choose("undecided")}>
          <Undo2 size={14} /> Undo
        </Button>
      </div>
    );
  }

  return (
    <article
      className={cn(
        "rise group relative flex overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-lg",
        e.is_bengaluru && "ring-1 ring-accent/30",
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      {/* Date stub */}
      <div className={cn("flex w-[76px] shrink-0 flex-col items-center justify-center py-4 sm:w-[88px]", e.is_bengaluru ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink")}>
        <div className="text-[11px] font-bold tracking-[0.14em] opacity-80">{d.month}</div>
        <div className="font-display text-[34px] leading-none font-extrabold tabular">{d.day}</div>
        <div className="mt-0.5 text-xs font-medium opacity-80">{d.weekday}</div>
      </div>
      <div className="perf shrink-0" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4 pl-2 sm:p-5 sm:pl-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {e.is_bengaluru && (
            <Badge tone="accent">
              <MapPin size={11} /> Bengaluru
            </Badge>
          )}
          <EarlyBirdBadge e={e} />
          {e.scarcity_signals.slice(0, 1).map((s) => (
            <Badge key={s} tone="urgent">
              {s}
            </Badge>
          ))}
          {isNew && <Badge tone="ok">New · {timeAgo(e.first_seen_at)}</Badge>}
          {e.needs_review && <Badge tone="neutral" title="Seen on one weak source. Waiting for a second source before alerting.">Unconfirmed</Badge>}
        </div>

        <div className="flex items-center gap-3">
          <Avatar name={e.artist.name} src={e.artist.image_url} size={44} />
          <div className="min-w-0">
            <Link href={`/events/${e.id}`} className="block truncate font-display text-lg leading-tight font-bold hover:underline sm:text-xl">
              {e.artist.name}
            </Link>
            <div className="truncate text-sm text-ink-2">
              {[e.venue, e.city].filter(Boolean).join(" · ")}
              {e.starts_at ? ` · ${formatTime(e.starts_at)}` : ""}
            </div>
          </div>
          {e.price_min_inr ? (
            <div className="ml-auto hidden shrink-0 text-right sm:block">
              <div className="text-[11px] text-muted">from</div>
              <div className="tabular font-semibold">₹{e.price_min_inr.toLocaleString("en-IN")}</div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {e.ticket_url && (
            <a href={e.ticket_url} target="_blank" rel="noopener noreferrer" className={buttonClass(e.early_bird_status === "available" ? "eb" : "primary", "sm")}>
              <Ticket size={14} /> {e.early_bird_status === "available" ? "Grab early bird" : "Get tickets"}
            </a>
          )}
          {decision === "going" ? (
            <Button size="sm" variant="secondary" onClick={() => choose("undecided")} disabled={busy !== null} className="text-ok">
              <CalendarCheck2 size={14} /> Going · in calendar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => choose("going")} disabled={busy !== null}>
              <CalendarPlus size={14} /> {busy === "going" ? "Booking…" : "I'm going"}
            </Button>
          )}
          {decision !== "going" && (
            <Button size="sm" variant="ghost" onClick={() => choose(decision === "maybe" ? "undecided" : "maybe")} disabled={busy !== null}>
              <BellRing size={14} /> {decision === "maybe" ? "Reminder set" : "Remind me"}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => choose("skip")} disabled={busy !== null} aria-label="Not interested" title="Not interested" className="ml-auto">
            <EyeOff size={15} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px] text-muted">
          <span className="font-medium">Live from</span>
          {sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink-2 hover:text-accent">
              {SOURCE_LABEL[s.source] ?? s.source}
            </a>
          ))}
          <span className="tabular">· first seen {formatDateTime(e.first_seen_at)} IST</span>
        </div>
      </div>
    </article>
  );
}

function dedupeSources(s: FeedEvent["sources"]) {
  const seen = new Set<string>();
  return s
    .slice()
    .sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at))
    .filter((x) => (seen.has(x.source) ? false : (seen.add(x.source), true)))
    .slice(0, 4);
}
