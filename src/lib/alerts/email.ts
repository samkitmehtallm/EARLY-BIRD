import { calendarTemplateUrl } from "../google/calendar";
import { SOURCE_LABEL } from "../normalize";
import { countdown, formatDateTime, formatDay, formatTime } from "../time";
import type { AlertRow } from "../types";

export interface AlertItem {
  alert: Pick<AlertRow, "id" | "kind" | "urgent" | "summary">;
  event: {
    id: string;
    venue: string | null;
    city: string;
    starts_on: string;
    starts_at: string | null;
    ticket_url: string | null;
    price_min_inr: number | null;
    early_bird_status: string;
    early_bird_deadline: string | null;
    scarcity_signals: string[];
    is_bengaluru: boolean;
    best_source: string | null;
    first_seen_at: string;
  };
  artist: { name: string; image_url: string | null };
  decideUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const KIND_LABEL: Record<string, string> = {
  new: "Just announced",
  early_bird_open: "Early bird open",
  deadline_soon: "Early bird closing",
  changed: "Update",
};

/** Bengaluru first, then urgent, then soonest show. */
export function orderItems(items: AlertItem[]) {
  return [...items].sort(
    (a, b) =>
      Number(b.event.is_bengaluru) - Number(a.event.is_bengaluru) ||
      Number(b.alert.urgent) - Number(a.alert.urgent) ||
      a.event.starts_on.localeCompare(b.event.starts_on),
  );
}

export function subjectFor(items: AlertItem[]): string {
  const [top] = orderItems(items);
  const d = formatDay(top.event.starts_on);
  const where = top.event.city;
  const head =
    top.alert.kind === "deadline_soon"
      ? `Early bird closes soon: ${top.artist.name}`
      : top.alert.kind === "early_bird_open" || top.event.early_bird_status === "available"
        ? `EARLY BIRD OPEN: ${top.artist.name}`
        : top.alert.kind === "changed"
          ? `Update: ${top.artist.name}`
          : `New show: ${top.artist.name}`;
  const more = items.length > 1 ? ` (+${items.length - 1} more)` : "";
  return `${head} · ${where} · ${d.weekday} ${d.day} ${d.month}${more}`;
}

function earlyBirdLine(e: AlertItem["event"]): { text: string; urgent: boolean } | null {
  const left = e.early_bird_deadline ? countdown(e.early_bird_deadline) : null;
  switch (e.early_bird_status) {
    case "available":
      return {
        text: e.early_bird_deadline
          ? `Early bird is OPEN — ends ${formatDateTime(e.early_bird_deadline)} IST${left ? ` (${left} left)` : ""}`
          : "Early bird is OPEN now — limited window",
        urgent: true,
      };
    case "upcoming":
      return { text: e.early_bird_deadline ? `Early bird opens soon (window ends ${formatDateTime(e.early_bird_deadline)})` : "Early bird / pre-sale announced, not open yet", urgent: false };
    case "sold_out":
      return { text: "Early bird sold out — regular tickets may remain", urgent: false };
    default:
      return null;
  }
}

export function renderEmail(items: AlertItem[], appUrl: string): { html: string; text: string } {
  const ordered = orderItems(items);
  const cards = ordered
    .map((it) => {
      const e = it.event;
      const d = formatDay(e.starts_on);
      const eb = earlyBirdLine(e);
      const cal = calendarTemplateUrl({
        eventId: e.id, artist: it.artist.name, venue: e.venue, city: e.city, startsOn: e.starts_on, startsAt: e.starts_at,
        ticketUrl: e.ticket_url, earlyBirdDeadline: e.early_bird_deadline, source: e.best_source,
      });
      const pills = [
        e.is_bengaluru ? `<span style="background:#3047E0;color:#fff;border-radius:99px;padding:3px 9px;font-size:11px;font-weight:700;letter-spacing:.06em">BENGALURU</span>` : "",
        it.alert.urgent ? `<span style="background:#C2261A;color:#fff;border-radius:99px;padding:3px 9px;font-size:11px;font-weight:700;letter-spacing:.06em">URGENT</span>` : "",
        `<span style="color:#5E6673;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase">${esc(KIND_LABEL[it.alert.kind] ?? "Alert")}</span>`,
      ].filter(Boolean).join(" &nbsp;");
      const btn = (href: string, label: string, primary = false) =>
        `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 0 0;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;${primary ? "background:#111318;color:#fff" : "background:#EEF0F3;color:#111318"}">${label}</a>`;
      return `
<tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #DDE1E7;border-radius:12px;${e.is_bengaluru ? "border-left:4px solid #3047E0;" : ""}">
<tr>
<td width="76" valign="top" style="padding:18px 0 18px 18px;font-family:Arial,sans-serif">
  <div style="font-size:11px;font-weight:700;color:#5E6673;letter-spacing:.08em">${d.month}</div>
  <div style="font-size:30px;font-weight:800;color:#111318;line-height:1">${d.day}</div>
  <div style="font-size:12px;color:#5E6673">${d.weekday}</div>
</td>
<td valign="top" style="padding:18px 18px 18px 6px;font-family:Arial,sans-serif;color:#111318">
  <div>${pills}</div>
  <div style="font-size:20px;font-weight:800;margin:8px 0 2px">${esc(it.artist.name)}</div>
  <div style="font-size:14px;color:#3a404a">${esc([e.venue, e.city].filter(Boolean).join(" · "))}${e.starts_at ? ` · ${formatTime(e.starts_at)}` : ""}</div>
  ${eb ? `<div style="margin-top:10px;font-size:14px;${eb.urgent ? "font-weight:800;color:#B45309" : "color:#3a404a"}">${eb.urgent ? "⏰ " : ""}${esc(eb.text)}</div>` : ""}
  ${e.scarcity_signals.length ? `<div style="margin-top:4px;font-size:13px;font-weight:700;color:#C2261A">${esc(e.scarcity_signals.join(" · "))}</div>` : ""}
  ${e.price_min_inr ? `<div style="margin-top:4px;font-size:13px;color:#5E6673">From ₹${e.price_min_inr.toLocaleString("en-IN")}</div>` : ""}
  <div style="margin-top:12px">
    ${e.ticket_url ? btn(e.ticket_url, "Get tickets", true) : ""}
    ${btn(`${it.decideUrl}&choice=going`, "I'm going → calendar")}
    ${btn(`${it.decideUrl}&choice=maybe`, "Remind me")}
    ${btn(cal, "Add to Google Calendar")}
  </div>
  <div style="margin-top:10px;font-size:11px;color:#8E96A3">Found on ${esc(SOURCE_LABEL[e.best_source ?? "web"] ?? "the web")} · first seen ${formatDateTime(e.first_seen_at)} IST</div>
</td></tr></table>
</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#F5F6F8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 0 16px;font-family:Arial,sans-serif">
  <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#3047E0">EARLY BIRD</div>
  <div style="font-size:15px;color:#3a404a;margin-top:4px">${ordered.length === 1 ? "A show you follow just changed." : `${ordered.length} updates on artists you follow.`} Bengaluru is listed first.</div>
</td></tr>
${cards}
<tr><td style="font-family:Arial,sans-serif;font-size:12px;color:#8E96A3;padding-top:6px">
  <a href="${esc(appUrl)}" style="color:#3047E0">Open your dashboard</a> · manage artists and alerts there.
</td></tr>
</table></td></tr></table></body></html>`;

  const text = ordered
    .map((it) => {
      const e = it.event;
      const eb = earlyBirdLine(e);
      return [
        `${it.alert.urgent ? "[URGENT] " : ""}${e.is_bengaluru ? "[BENGALURU] " : ""}${KIND_LABEL[it.alert.kind] ?? "Alert"}: ${it.artist.name}`,
        `${[e.venue, e.city].filter(Boolean).join(", ")} — ${formatDay(e.starts_on).long}`,
        eb?.text,
        e.ticket_url ? `Tickets: ${e.ticket_url}` : null,
        `Decide: ${it.decideUrl}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return { html, text: `${text}\n\nDashboard: ${appUrl}` };
}
