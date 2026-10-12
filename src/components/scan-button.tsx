"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CircleDashed, Loader2, Minus, RefreshCw, X, AlertTriangle } from "lucide-react";
import type { ScanProgress } from "@/lib/pipeline/runner";
import { Button, cn } from "./ui";

type Job = ScanProgress["jobs"][number];

export function ScanButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<string | null>(null);

  // Live job list while a step call is in flight.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(async () => {
      if (!runRef.current) return;
      const r = await fetch(`/api/scan/${runRef.current}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) setData(await r.json());
    }, 2000);
    return () => clearInterval(t);
  }, [busy]);

  const scan = useCallback(async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const s = await fetch("/api/scan/start", { method: "POST" });
      const sj = await s.json();
      if (!s.ok) throw new Error(sj.error ?? "Could not start a scan.");
      runRef.current = sj.runId;
      if (sj.cooldown) toast.info("A scan just finished — showing its results.");

      let last: ScanProgress | null = null;
      for (let i = 0; i < 25; i++) {
        const r = await fetch("/api/scan/step", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: sj.runId }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Scan step failed.");
        last = j as ScanProgress;
        setData(last);
        if (last.done) break;
      }
      if (last) {
        const { events_new: n, events_changed: c } = last.run;
        const parts = [n ? `${n} new show${n === 1 ? "" : "s"}` : null, c ? `${c} update${c === 1 ? "" : "s"}` : null].filter(Boolean);
        if (last.done) toast.success(parts.length ? `Scan finished — ${parts.join(", ")}.` : "Scan finished — nothing new since the last check.");
        else toast.info("Scan is still running in the background. It will finish on the next scheduled check.");
        for (const note of last.run.notes ?? []) if (/connect|add a|No data source|alert/i.test(note)) toast(note);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <>
      <Button variant="primary" size="md" onClick={scan} disabled={disabled || busy} aria-label="Scan now">
        <RefreshCw size={16} className={cn(busy && "animate-spin")} />
        <span className="hidden sm:inline">{busy ? "Scanning…" : "Scan now"}</span>
      </Button>
      {open && <ScanPanel data={data} busy={busy} error={error} onClose={() => setOpen(false)} />}
    </>
  );
}

function ScanPanel({ data, busy, error, onClose }: { data: ScanProgress | null; busy: boolean; error: string | null; onClose: () => void }) {
  const jobs = data?.jobs ?? [];
  const done = jobs.filter((j) => j.status !== "pending" && j.status !== "running").length;
  const pct = jobs.length ? Math.round((done / jobs.length) * 100) : busy ? 4 : 0;

  return (
    <div
      role="dialog"
      aria-label="Scan progress"
      className="fixed right-3 bottom-20 left-3 z-40 flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:left-auto sm:w-[420px] md:bottom-6"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold">{busy ? "Checking every source…" : error ? "Scan stopped" : "Scan complete"}</div>
          <div className="tabular text-xs text-muted" aria-live="polite">
            {jobs.length ? `${done} of ${jobs.length} checks` : busy ? "Planning the run" : error ?? ""}
            {data ? ` · ${data.run.events_new} new · ${data.run.events_changed} updated` : ""}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X size={16} />
        </Button>
      </div>
      <div className="h-1 bg-surface-2">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex-1 divide-y divide-line overflow-y-auto text-[13px]">
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
        {!jobs.length && !busy && !error && <li className="px-4 py-6 text-center text-muted">No sources ran. Add keys in Settings.</li>}
      </ul>
      {data?.run.notes?.length ? (
        <div className="border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-2">{data.run.notes.join(" ")}</div>
      ) : null}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const icon = {
    pending: <CircleDashed size={15} className="text-muted" />,
    running: <Loader2 size={15} className="animate-spin text-accent" />,
    done: job.found ? <Check size={15} className="text-ok" /> : <Minus size={15} className="text-muted" />,
    failed: <AlertTriangle size={15} className="text-urgent" />,
    skipped: <Minus size={15} className="text-muted" />,
  }[job.status];
  return (
    <li className="flex items-start gap-2.5 px-4 py-2">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-ink">{job.label}</div>
        {job.status === "failed" || job.status === "skipped" ? (
          <div className="truncate text-xs text-muted" title={job.error ?? ""}>{job.error}</div>
        ) : null}
      </div>
      {job.found > 0 && <span className="tabular shrink-0 rounded-full bg-ok-soft px-2 text-[11px] font-semibold text-ok">{job.found} found</span>}
    </li>
  );
}
