"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ListPlus, Plus, Search, Star, Trash2, Undo2 } from "lucide-react";
import { addArtists, removeArtist, restoreArtist, setTier } from "@/app/actions";
import { timeAgo } from "@/lib/time";
import type { Artist } from "@/lib/types";
import { Avatar, Badge, Button, Card, cn } from "./ui";

type Row = Artist & { upcoming: number };
interface Suggestion {
  name: string;
  imageUrl: string | null;
  fans: number;
}

export function ArtistManager({ artists }: { artists: Row[] }) {
  const [filter, setFilter] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const active = artists.filter((a) => a.is_active);
  const removed = artists.filter((a) => !a.is_active);
  const shown = useMemo(
    () => active.filter((a) => !filter || a.name.toLowerCase().includes(filter.toLowerCase())),
    [active, filter],
  );

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-4 sm:p-5">
        <AddArtist />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline" onClick={() => setShowBulk((v) => !v)}>
            <ListPlus size={15} /> {showBulk ? "Hide bulk add" : "Paste a list or CSV"}
          </button>
          <span className="text-muted">Spotify import is optional — the list here is all Early Bird needs.</span>
        </div>
        {showBulk && <BulkAdd onDone={() => setShowBulk(false)} />}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Filter artists</span>
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id="artist-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${active.length} artists`}
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
        <span className="text-sm text-muted">
          <Star size={13} className="mr-1 inline fill-eb text-eb" />
          {active.filter((a) => a.tier === "priority").length} favourites
        </span>
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => (
          <ArtistRow key={a.id} a={a} />
        ))}
      </ul>

      {removed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Not watching ({removed.length})</summary>
          <ul className="mt-3 flex flex-wrap gap-2">
            {removed.map((a) => (
              <li key={a.id}>
                <RestoreChip a={a} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ArtistRow({ a }: { a: Row }) {
  const [pending, start] = useTransition();
  const [tier, setLocalTier] = useState(a.tier);
  const fav = tier === "priority";
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-opacity", pending && "opacity-60")}>
      <Avatar name={a.name} src={a.image_url} size={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{a.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {a.upcoming > 0 ? <Badge tone="accent">{a.upcoming} upcoming</Badge> : <span>No shows yet</span>}
          <span className="tabular truncate">· checked {timeAgo(a.last_checked_at)}</span>
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-pressed={fav}
        aria-label={fav ? "Remove from favourites" : "Mark as favourite"}
        title={fav ? "Favourite — checked every scan" : "Mark as favourite"}
        onClick={() =>
          start(async () => {
            const next = fav ? "normal" : "priority";
            setLocalTier(next);
            const r = await setTier(a.id, next);
            if (!r.ok) {
              setLocalTier(a.tier);
              toast.error(r.message);
            }
          })
        }
      >
        <Star size={17} className={cn(fav ? "fill-eb text-eb" : "text-muted")} />
      </Button>
      <Button
        size="icon"
        variant="danger"
        aria-label={`Stop watching ${a.name}`}
        onClick={() =>
          start(async () => {
            const r = await removeArtist(a.id);
            if (r.ok) toast.success(`${a.name}: ${r.message}`, { action: { label: "Undo", onClick: () => void restoreArtist(a.id) } });
            else toast.error(r.message);
          })
        }
      >
        <Trash2 size={15} />
      </Button>
    </li>
  );
}

function RestoreChip({ a }: { a: Row }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => void toast((await restoreArtist(a.id)).message))}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-ink-2 hover:border-ink-2"
    >
      <Undo2 size={13} /> {a.name}
    </button>
  );
}

function AddArtist() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ results: [] }));
      setResults(r.results ?? []);
      setActive(0);
      setOpen(true);
    }, 220);
  }, [q]);

  function add(name: string, imageUrl?: string | null) {
    start(async () => {
      const r = await addArtists(name, "normal", imageUrl);
      (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) {
        setQ("");
        setResults([]);
        setOpen(false);
      }
    });
  }

  return (
    <div className="relative">
      <label htmlFor="add-artist" className="text-sm font-semibold">
        Add an artist
      </label>
      <div className="mt-1.5 flex gap-2">
        <div className="relative flex-1">
          <input
            id="add-artist"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="artist-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const pick = open && results[active];
                if (pick) add(pick.name, pick.imageUrl);
                else if (q.trim()) add(q.trim());
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Start typing — e.g. Prateek Kuhad, Anuv Jain, Fred again.."
            className="h-11 w-full rounded-xl border border-line bg-bg px-4 text-[15px] outline-none placeholder:text-muted focus:border-accent"
          />
          {open && results.length > 0 && (
            <ul id="artist-suggestions" role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
              {results.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(r.name, r.imageUrl);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex cursor-pointer items-center gap-3 px-3 py-2", i === active && "bg-surface-2")}
                >
                  <Avatar name={r.name} src={r.imageUrl} size={32} />
                  <span className="flex-1 truncate font-medium">{r.name}</span>
                  <span className="tabular text-xs text-muted">{r.fans >= 1000 ? `${Math.round(r.fans / 1000)}k fans` : `${r.fans} fans`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button variant="primary" className="h-11" disabled={pending || q.trim().length < 2} onClick={() => add(q.trim())}>
          <Plus size={16} /> Add
        </Button>
      </div>
    </div>
  );
}

function BulkAdd({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const count = text.split(/[\n,;]+/).filter((s) => s.trim().length >= 2).length;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor="bulk-artists" className="sr-only">
        Artists, one per line
      </label>
      <textarea
        id="bulk-artists"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"One per line, or paste a CSV column:\nThe Local Train\nWhen Chai Met Toast\nLifafa"}
        className="w-full rounded-xl border border-line bg-bg p-3 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,.txt"
          id="csv-file"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText((await f.text()).split(/\r?\n/).map((l) => l.split(",")[0].replace(/^"|"$/g, "")).join("\n"));
          }}
        />
        <label htmlFor="csv-file" className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ink-2">
          Upload CSV
        </label>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          disabled={pending || !count}
          onClick={() =>
            start(async () => {
              const r = await addArtists(text);
              (r.ok ? toast.success : toast.error)(r.message);
              if (r.ok) {
                setText("");
                onDone();
              }
            })
          }
        >
          Add {count || ""} artist{count === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
