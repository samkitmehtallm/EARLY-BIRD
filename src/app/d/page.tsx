import type { Metadata } from "next";
import { verifyToken } from "@/lib/crypto";
import { has } from "@/lib/env";
import { getEvent } from "@/lib/queries";
import { formatDay } from "@/lib/time";
import { DecidePanel } from "@/components/decide-panel";
import { EarlyBirdBadge } from "@/components/event-card";
import { Avatar, Card, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Decide", robots: { index: false } };

/**
 * Landing page for buttons in alert emails. It never acts on the GET itself — mail
 * scanners pre-open links — so the decision always needs one tap here.
 */
export default async function DecidePage({ searchParams }: { searchParams: Promise<{ t?: string; choice?: string }> }) {
  const { t, choice } = await searchParams;
  const payload = t ? verifyToken<{ e: string }>(t) : null;
  const data = payload && has.db() ? await getEvent(payload.e).catch(() => null) : null;

  if (!t || !payload || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">This link has expired</h1>
        <p className="text-muted">Open the dashboard to see the show and decide there.</p>
        <LinkButton href="/" variant="primary">
          Open dashboard
        </LinkButton>
      </div>
    );
  }
  const e = data.event;
  const d = formatDay(e.starts_on);
  const preset = choice === "going" || choice === "maybe" || choice === "skip" ? choice : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 py-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={e.artist.name} src={e.artist.image_url} size={52} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold">{e.artist.name}</h1>
            <div className="text-sm text-ink-2">
              {[e.venue, e.city].filter(Boolean).join(" · ")} · {d.long}
            </div>
          </div>
        </div>
        <EarlyBirdBadge e={e} />
        <DecidePanel token={t} preset={preset} current={e.decision} ticketUrl={e.ticket_url} />
      </Card>
    </div>
  );
}
