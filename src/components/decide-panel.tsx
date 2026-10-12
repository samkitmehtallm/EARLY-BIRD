"use client";

import { useState, useTransition } from "react";
import { BellRing, CalendarPlus, CheckCircle2, EyeOff, Loader2, Ticket } from "lucide-react";
import { decideViaToken } from "@/app/actions";
import type { Decision } from "@/lib/types";
import { Button, buttonClass, cn, LinkButton } from "./ui";

type Choice = "going" | "maybe" | "skip";

export function DecidePanel({ token, preset, current, ticketUrl }: { token: string; preset: Choice | null; current: Decision; ticketUrl: string | null }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; link?: string; template?: string } | null>(null);
  const [picked, setPicked] = useState<Choice | null>(preset);

  const go = (c: Choice) => {
    setPicked(c);
    start(async () => {
      const r = await decideViaToken(token, c);
      setResult({
        ok: r.ok,
        message: r.message,
        link: r.ok ? (c === "going" ? r.calendarLinks?.show : r.calendarLinks?.earlybird ?? r.calendarLinks?.reminder) : undefined,
        template: r.ok ? r.templateUrl : undefined,
      });
    });
  };

  if (result?.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-ok-soft p-4">
        <div className="flex items-center gap-2 font-semibold text-ok">
          <CheckCircle2 size={18} /> {result.message}
        </div>
        <div className="flex flex-wrap gap-2">
          {result.link && (
            <a href={result.link} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
              Open in Google Calendar
            </a>
          )}
          {result.template && (
            <a href={result.template} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
              <CalendarPlus size={14} /> Add to Google Calendar
            </a>
          )}
          {ticketUrl && picked === "going" && (
            <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("eb", "sm")}>
              <Ticket size={14} /> Get tickets
            </a>
          )}
          <LinkButton href="/" size="sm" variant="ghost">
            Back to all shows
          </LinkButton>
        </div>
      </div>
    );
  }

  const options: { c: Choice; label: string; hint: string; icon: typeof CalendarPlus }[] = [
    { c: "going", label: "I'm going", hint: "Adds the show and an early-bird reminder to your calendar", icon: CalendarPlus },
    { c: "maybe", label: "Remind me", hint: "One calendar reminder before the early bird closes", icon: BellRing },
    { c: "skip", label: "Not interested", hint: "Hides the show and mutes its alerts", icon: EyeOff },
  ];

  return (
    <div className="flex flex-col gap-2">
      {current !== "undecided" && <p className="text-sm text-muted">Current choice: {current}. Pick again to change it.</p>}
      {options.map(({ c, label, hint, icon: Icon }) => (
        <Button
          key={c}
          variant={picked === c ? "primary" : "secondary"}
          className={cn("h-auto justify-start gap-3 py-3 text-left")}
          disabled={pending}
          onClick={() => go(c)}
        >
          {pending && picked === c ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
          <span className="flex flex-col">
            <span className="font-semibold">{label}</span>
            <span className="text-xs font-normal opacity-75">{hint}</span>
          </span>
        </Button>
      ))}
      {result && !result.ok && <p className="text-sm text-urgent">{result.message}</p>}
    </div>
  );
}
