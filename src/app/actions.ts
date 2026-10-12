"use server";

import { revalidatePath } from "next/cache";
import { dispatchAlerts } from "@/lib/alerts/dispatch";
import { sendEmail } from "@/lib/alerts/send";
import { db, must } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { pingGemini } from "@/lib/extract/gemini";
import { disconnectGoogle } from "@/lib/google/oauth";
import { slugify } from "@/lib/normalize";
import { artistImage } from "@/lib/sources/deezer";
import { googleSearch, scrapingBeeUsage } from "@/lib/sources/scrapingbee";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

/** Adds one or many artists (one per line / comma separated). Duplicates are ignored, not errors. */
export async function addArtists(raw: string, tier: "priority" | "normal" = "normal", imageUrl?: string | null): Promise<ActionResult> {
  try {
    const names = [...new Set(raw.split(/[\n,;]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 2 && s.length <= 80))].slice(0, 100);
    if (!names.length) return { ok: false, message: "Type at least one artist name." };
    const rows = await Promise.all(
      names.map(async (name) => ({
        name,
        slug: slugify(name),
        tier,
        origin: "india" as const,
        source: names.length > 1 ? ("csv" as const) : ("manual" as const),
        image_url: names.length === 1 && imageUrl ? imageUrl : names.length <= 10 ? await artistImage(name).catch(() => null) : null,
      })),
    );
    const res = await db().from("artists").upsert(rows, { onConflict: "slug", ignoreDuplicates: true }).select("id");
    must(res, "add artists");
    const added = res.data?.length ?? 0;
    revalidatePath("/artists");
    const skipped = names.length - added;
    return {
      ok: true,
      message: added
        ? `Added ${added} artist${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already on your list)` : ""}. They'll be checked on the next scan.`
        : "Already on your list.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setTier(id: string, tier: "priority" | "normal"): Promise<ActionResult> {
  try {
    must(await db().from("artists").update({ tier }).eq("id", id), "update artist");
    revalidatePath("/artists");
    return { ok: true, message: tier === "priority" ? "Marked as a favourite — checked on every scan." : "Back to the normal rotation." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeArtist(id: string): Promise<ActionResult> {
  try {
    must(await db().from("artists").update({ is_active: false }).eq("id", id), "remove artist");
    revalidatePath("/artists");
    revalidatePath("/");
    return { ok: true, message: "Stopped watching. Existing shows stay in history." };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreArtist(id: string): Promise<ActionResult> {
  try {
    must(await db().from("artists").update({ is_active: true }).eq("id", id), "restore artist");
    revalidatePath("/artists");
    return { ok: true, message: "Watching again." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSettings(form: FormData): Promise<ActionResult> {
  try {
    const email = String(form.get("alert_email") ?? "").trim();
    const cap = Number(form.get("daily_credit_cap") ?? 300);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "That email address doesn't look right." };
    if (!Number.isFinite(cap) || cap < 0 || cap > 100_000) return { ok: false, message: "Credit cap must be between 0 and 100000." };
    must(
      await db().from("settings").update({ alert_email: email || null, daily_credit_cap: Math.round(cap), updated_at: new Date().toISOString() }).eq("id", 1),
      "save settings",
    );
    revalidatePath("/settings");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function sendTestEmail(): Promise<ActionResult> {
  try {
    const s = must(await db().from("settings").select("alert_email,google_email").eq("id", 1).single(), "load settings") as {
      alert_email: string | null;
      google_email: string | null;
    };
    const to = s.alert_email ?? s.google_email ?? process.env.ALERT_EMAIL_TO;
    if (!to) return { ok: false, message: "Add an alert email first." };
    const res = await sendEmail(
      {
        to,
        subject: "Early Bird test — alerts will arrive like this",
        text: `Early Bird can email you. Dashboard: ${appUrl()}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px"><b style="letter-spacing:.12em;color:#3047E0">EARLY BIRD</b><p>Email alerts are working. New shows, early-bird windows and deadlines will arrive here, Bengaluru first.</p><a href="${appUrl()}">Open the dashboard</a></div>`,
      },
      s.google_email,
    );
    return { ok: true, message: `Test email sent to ${to} via ${res.channel === "gmail" ? "Gmail API" : "Gmail SMTP"}.` };
  } catch (e) {
    const err = e as Error & { noChannel?: boolean };
    return { ok: false, message: err.noChannel ? "Connect Google (or set Gmail SMTP keys) first." : err.message };
  }
}

export async function testGemini(): Promise<ActionResult> {
  try {
    const t0 = Date.now();
    const out = await pingGemini();
    return { ok: true, message: `Gemini answered "${out}" in ${Date.now() - t0} ms.` };
  } catch (e) {
    return fail(e);
  }
}

export async function testScrapingBee(): Promise<ActionResult> {
  try {
    const usage = await scrapingBeeUsage();
    const { hits, credits } = await googleSearch("Bengaluru concerts this month tickets");
    return {
      ok: true,
      message: `ScrapingBee returned ${hits.length} Google results (${credits} credits).${usage ? ` ${usage.max - usage.used} credits left this cycle.` : ""}`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function retryAlerts(): Promise<ActionResult> {
  try {
    await db().from("alerts").update({ status: "pending", attempts: 0 }).in("status", ["failed", "in_app"]).or("channel.is.null,channel.neq.muted");
    const res = await dispatchAlerts();
    revalidatePath("/alerts");
    return { ok: true, message: res.message ?? (res.sent ? `Sent ${res.sent}.` : "Nothing to send.") };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectGoogleAction(): Promise<ActionResult> {
  try {
    await disconnectGoogle();
    revalidatePath("/settings");
    return { ok: true, message: "Google disconnected." };
  } catch (e) {
    return fail(e);
  }
}

/** Used by the one-tap page linked from alert emails. The signed token stands in for a login. */
export async function decideViaToken(token: string, decision: "going" | "maybe" | "skip") {
  const { verifyToken } = await import("@/lib/crypto");
  const { decide } = await import("@/lib/decisions");
  const t = verifyToken<{ e: string }>(token);
  if (!t) return { ok: false as const, message: "This link has expired. Open the dashboard to decide." };
  try {
    const r = await decide(t.e, decision);
    revalidatePath("/");
    return { ok: true as const, message: r.message, calendarLinks: r.calendarLinks, templateUrl: r.templateUrl };
  } catch (e) {
    return { ok: false as const, message: (e as Error).message };
  }
}
