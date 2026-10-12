"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import type { IntegrationStatus } from "@/lib/queries";
import { Button, buttonClass } from "./ui";

/** Shows only while something important is missing. Dismissible per browser. */
export function SetupChecklist({ items }: { items: IntegrationStatus[] }) {
  const [hidden, setHidden] = useState(true);
  const important = items.filter((i) => ["gemini", "scrapingbee", "google"].includes(i.id));
  const missing = important.filter((i) => i.state !== "connected");
  const storageKey = `eb-setup-dismissed-${missing.map((m) => m.id).join(",")}`;

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
  }, [storageKey]);

  if (!missing.length || hidden) return null;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-bold">Finish setup to get live alerts</div>
          <p className="mt-0.5 text-sm text-ink-2">The feed works now. These connections turn on fresh scraping, smart extraction and email + calendar.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {important.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm">
                {i.state === "connected" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={17} className="mt-0.5 shrink-0 text-muted" />}
                <span>
                  <span className="font-semibold">{i.name}</span>
                  <span className="block text-xs text-muted">{i.state === "connected" ? "Connected" : i.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/settings" className={buttonClass("primary", "sm", "mt-4")}>
            Open settings
          </Link>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(storageKey, "1");
            } catch {}
          }}
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
