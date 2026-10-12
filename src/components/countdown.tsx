"use client";

import { useEffect, useState } from "react";
import { countdown } from "@/lib/time";

/** Live "2d 14h" countdown; re-renders every 30s. Renders nothing once the moment passes. */
export function Countdown({ to, prefix = "", suffix = " left" }: { to: string; prefix?: string; suffix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const text = countdown(to, now ?? Date.now());
  if (!text) return null;
  return (
    <span className="tabular" suppressHydrationWarning>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
