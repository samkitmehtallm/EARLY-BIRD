"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/time";
import type { ScanRun } from "@/lib/types";
import { cn } from "./ui";

export function LivePill({ lastRun }: { lastRun: ScanRun | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const running = lastRun?.status === "running";
  const when = lastRun?.finished_at ?? lastRun?.started_at ?? null;
  const healthy = lastRun && lastRun.status !== "failed";

  return (
    <Link
      href="/activity"
      className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 sm:flex"
      title="Open the live data log"
    >
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", running ? "bg-eb" : healthy ? "bg-ok" : "bg-muted")}>
        {(running || healthy) && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", running ? "bg-eb" : "bg-ok")} />}
      </span>
      {running ? "Scanning now" : lastRun ? <span className="tabular">Live · scanned {timeAgo(when, now)}</span> : "No scans yet"}
    </Link>
  );
}
