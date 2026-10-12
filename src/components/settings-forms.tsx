"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import {
  disconnectGoogleAction,
  retryAlerts,
  saveSettings,
  sendTestEmail,
  testGemini,
  testScrapingBee,
  type ActionResult,
} from "@/app/actions";
import { Button } from "./ui";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      (r.ok ? toast.success : toast.error)(r.message);
    });
  return { pending, run };
}

export function SettingsForm({ alertEmail, cap }: { alertEmail: string | null; cap: number }) {
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={(fd) => run(() => saveSettings(fd))}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Send alerts to</span>
        <input
          id="alert_email"
          name="alert_email"
          type="email"
          defaultValue={alertEmail ?? ""}
          placeholder="karan@example.com"
          className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">Defaults to your connected Google address.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Daily ScrapingBee credit cap</span>
        <input
          id="daily_credit_cap"
          name="daily_credit_cap"
          type="number"
          min={0}
          step={50}
          defaultValue={cap}
          className="tabular h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">Scraping pauses for the day once this is reached. APIs keep running.</span>
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}

export function TestButton({ kind, disabled }: { kind: "email" | "gemini" | "scrapingbee"; disabled?: boolean }) {
  const { pending, run } = useAction();
  const fn = { email: sendTestEmail, gemini: testGemini, scrapingbee: testScrapingBee }[kind];
  const label = { email: "Send test email", gemini: "Test Gemini", scrapingbee: "Test ScrapingBee" }[kind];
  return (
    <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => run(fn)}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />} {label}
    </Button>
  );
}

export function DisconnectGoogle() {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(disconnectGoogleAction)}>
      Disconnect
    </Button>
  );
}

export function RetryAlertsButton({ count }: { count: number }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="primary" disabled={pending} onClick={() => run(retryAlerts)}>
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Email {count} unsent
    </Button>
  );
}
