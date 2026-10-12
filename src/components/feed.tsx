"use client";

import { useMemo, useState } from "react";
import { Flame, MapPin, Search, Sparkles } from "lucide-react";
import { formatDay, hoursUntil } from "@/lib/time";
import type { FeedEvent } from "@/lib/types";
import { EventCard } from "./event-card";
import { Badge, cn, Empty, LinkButton } from "./ui";

type CityFilter = "all" | string;

export function Feed({ events, googleConnected }: { events: FeedEvent[]; googleConnected: boolean }) {
  const [city, setCity] = useState<CityFilter>("all");
  const [ebOnly, setEbOnly] = useState(false);
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const cities = useMemo(() => {
    const m = new Map<string, { slug: string; label: string; n: number }>();
    for (const e of events) {
      if (e.decision === "skip") continue;
      const c = m.get(e.city_slug) ?? { slug: e.city_slug, label: e.city, n: 0 };
      c.n++;
      m.set(e.city_slug, c);
    }
    return [...m.values()].sort((a, b) => (a.slug === "bengaluru" ? -1 : b.slug === "bengaluru" ? 1 : b.n - a.n));
  }, [events]);

  const hiddenCount = events.filter((e) => e.decision === "skip").length;
  const filtered = events.filter(
    (e) =>
      (showHidden || e.decision !== "skip") &&
      (city === "all" || e.city_slug === city) &&
      (!ebOnly || e.early_bird_status === "available" || e.early_bird_status === "upcoming") &&
      (!q || e.artist.name.toLowerCase().includes(q.toLowerCase()) || (e.venue ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  // Within a section: open early-bird windows closing soonest first, then by date.
  const urgency = (e: FeedEvent) =>
    e.early_bird_status === "available" ? (e.early_bird_deadline ? Math.max(0, hoursUntil(e.early_bird_deadline)) : 500) : 10_000;
  const sortSection = (list: FeedEvent[]) =>
    [...list].sort((a, b) => {
      const ua = urgency(a) < 72 ? urgency(a) : 10_000;
      const ub = urgency(b) < 72 ? urgency(b) : 10_000;
      return ua - ub || a.starts_on.localeCompare(b.starts_on);
    });

  const blr = sortSection(filtered.filter((e) => e.is_bengaluru));
  const rest = filtered.filter((e) => !e.is_bengaluru);
  const months = groupByMonth(rest);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="toolbar" aria-label="Filter by city">
          <Chip active={city === "all"} onClick={() => setCity("all")}>
            All India
          </Chip>
          {cities.map((c) => (
            <Chip key={c.slug} active={city === c.slug} onClick={() => setCity(c.slug)}>
              {c.slug === "bengaluru" && <MapPin size={12} />}
              {c.label}
              <span className="tabular opacity-60">{c.n}</span>
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <Chip active={ebOnly} onClick={() => setEbOnly((v) => !v)} tone="eb">
            <Flame size={12} /> Early bird
          </Chip>
          <label className="relative flex-1 lg:w-56 lg:flex-none">
            <span className="sr-only">Search artists or venues</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              id="feed-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artist or venue"
              className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
        </div>
      </div>

      {!events.length ? (
        <Empty
          icon={<Sparkles size={28} />}
          title="No shows yet"
          body="Press Scan now to check every source for the artists you follow. New announcements land here, with Bengaluru pinned on top."
          action={<LinkButton href="/artists" variant="secondary">Review your artists</LinkButton>}
        />
      ) : !filtered.length ? (
        <Empty title="Nothing matches these filters" body="Try All India, or turn off the early-bird filter." />
      ) : null}

      {blr.length > 0 ? (
        <section aria-labelledby="blr" className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 id="blr" className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              In Bengaluru
            </h2>
            <span className="text-sm text-muted">Your city — always listed first</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {blr.map((e, i) => (
              <EventCard key={e.id} e={e} index={i} googleConnected={googleConnected} />
            ))}
          </div>
        </section>
      ) : null}

      {months.map(([label, list]) => (
        <section key={label} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink-2">{city === "all" ? `Across India · ${label}` : label}</h2>
            <span className="tabular text-sm text-muted">{list.length}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sortSection(list).map((e, i) => (
              <EventCard key={e.id} e={e} index={i} googleConnected={googleConnected} />
            ))}
          </div>
        </section>
      ))}

      {hiddenCount > 0 && (
        <button onClick={() => setShowHidden((v) => !v)} className="self-center text-sm text-muted underline-offset-4 hover:underline">
          {showHidden ? "Hide" : "Show"} {hiddenCount} hidden show{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

function groupByMonth(list: FeedEvent[]): [string, FeedEvent[]][] {
  const m = new Map<string, FeedEvent[]>();
  for (const e of list) {
    const k = formatDay(e.starts_on).monthYear;
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return [...m.entries()];
}

function Chip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "eb" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
        active
          ? tone === "eb"
            ? "border-eb bg-eb-soft text-eb"
            : "border-ink bg-ink text-bg"
          : "border-line bg-surface text-ink-2 hover:border-ink-2",
      )}
    >
      {children}
    </button>
  );
}

export function StatStrip({ events }: { events: FeedEvent[] }) {
  const live = events.filter((e) => e.decision !== "skip" && !e.needs_review);
  const stats = [
    { label: "Upcoming shows", value: live.length, tone: "text-ink" },
    { label: "In Bengaluru", value: live.filter((e) => e.is_bengaluru).length, tone: "text-accent" },
    { label: "Early birds open", value: live.filter((e) => e.early_bird_status === "available").length, tone: "text-eb" },
    {
      label: "Closing in 72h",
      value: live.filter((e) => e.early_bird_deadline && hoursUntil(e.early_bird_deadline) > 0 && hoursUntil(e.early_bird_deadline) < 72).length,
      tone: "text-urgent",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-4 py-3.5">
          <dt className="text-xs font-medium text-muted">{s.label}</dt>
          <dd className={cn("tabular font-display text-3xl font-extrabold", s.value ? s.tone : "text-muted")}>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GoingStrip({ events }: { events: FeedEvent[] }) {
  const going = events.filter((e) => e.decision === "going");
  if (!going.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-muted">You&apos;re going to</span>
      {going.slice(0, 6).map((e) => (
        <Badge key={e.id} tone="ok">
          {e.artist.name} · {formatDay(e.starts_on).day} {formatDay(e.starts_on).month}
        </Badge>
      ))}
    </div>
  );
}
