import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleDashed, Coins, Minus } from "lucide-react";
import { has } from "@/lib/env";
import { getActivity } from "@/lib/queries";
import { scrapingBeeUsage } from "@/lib/sources/scrapingbee";
import { formatDateTime, timeAgo } from "@/lib/time";
import { ErrorPanel } from "@/components/error-panel";
import { SetupScreen } from "@/components/setup-screen";
import { Badge, Card, Empty, PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live data" };

const STATUS_TONE = { completed: "ok", partial: "eb", failed: "urgent", running: "accent" } as const;

export default async function ActivityPage() {
  if (!has.db()) return <SetupScreen />;
  let data, usage;
  try {
    [data, usage] = await Promise.all([getActivity(), scrapingBeeUsage()]);
  } catch (e) {
    return <ErrorPanel message={(e as Error).message} />;
  }
  const { runs, jobs, health } = data;
  const latest = runs[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Live data"
        lede="Proof of work: every scan, every source it hit, what it found and what it cost. Nothing on the Shows page is hardcoded — each card links back to the page it came from."
      />

      <section className="flex flex-col gap-3">
        <SectionTitle eyebrow="Sources" title="Source health today" />
        {health.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {health.map((h) => {
              const ok = h.consecutive_failures === 0;
              return (
                <Card key={h.source} className="flex items-start gap-3 p-4">
                  {ok ? <CheckCircle2 size={18} className="mt-0.5 text-ok" /> : <AlertTriangle size={18} className="mt-0.5 text-urgent" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold capitalize">{h.source.replace(/-/g, " ")}</div>
                    <div className="tabular text-xs text-muted">
                      {h.requests_today} request{h.requests_today === 1 ? "" : "s"} today{h.credits_today ? ` · ${h.credits_today} credits` : ""} · last ok {timeAgo(h.last_ok_at)}
                    </div>
                    {!ok && h.last_error && <div className="mt-1 line-clamp-2 text-xs text-urgent">{h.last_error}</div>}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty title="No sources have run yet" body="Press Scan now. Each source reports here as it is checked." />
        )}
        {usage && (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Coins size={15} className="text-eb" />
            ScrapingBee: <span className="tabular font-semibold">{(usage.max - usage.used).toLocaleString("en-IN")}</span> of{" "}
            <span className="tabular">{usage.max.toLocaleString("en-IN")}</span> credits left this cycle
          </div>
        )}
      </section>

      {latest && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            eyebrow="Latest scan"
            title={`${formatDateTime(latest.started_at)} IST`}
            right={<Badge tone={STATUS_TONE[latest.status]}>{latest.status}</Badge>}
          />
          {latest.notes.length > 0 && <p className="text-sm text-ink-2">{latest.notes.join(" ")}</p>}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wide text-muted uppercase">
                  <th className="px-4 py-2.5 font-medium">Check</th>
                  <th className="px-4 py-2.5 font-medium">Result</th>
                  <th className="px-4 py-2.5 text-right font-medium">Found</th>
                  <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {j.status === "done" ? (
                          j.found ? <CheckCircle2 size={14} className="text-ok" /> : <Minus size={14} className="text-muted" />
                        ) : j.status === "failed" ? (
                          <AlertTriangle size={14} className="text-urgent" />
                        ) : (
                          <CircleDashed size={14} className="text-muted" />
                        )}
                        <span className="truncate">{j.label}</span>
                      </div>
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-xs text-muted" title={j.error ?? ""}>
                      {j.status === "done" && !j.error ? "ok" : j.error ?? j.status}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-semibold">{j.found || "–"}</td>
                    <td className="tabular px-4 py-2.5 text-right text-muted">{j.credits || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle eyebrow="History" title="Recent scans" />
        {runs.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wide text-muted uppercase">
                  <th className="px-4 py-2.5 font-medium">Started (IST)</th>
                  <th className="px-4 py-2.5 font-medium">Trigger</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Checks</th>
                  <th className="px-4 py-2.5 text-right font-medium">New</th>
                  <th className="px-4 py-2.5 text-right font-medium">Changed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5">{formatDateTime(r.started_at)}</td>
                    <td className="px-4 py-2.5 capitalize">{r.trigger}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.jobs_done}/{r.jobs_total}
                      {r.jobs_failed ? <span className="text-urgent"> ({r.jobs_failed} failed)</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{r.events_new}</td>
                    <td className="px-4 py-2.5 text-right">{r.events_changed}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{r.credits_used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Empty title="No scans yet" body="Scans run on schedule and whenever you press Scan now." />
        )}
      </section>
    </div>
  );
}
