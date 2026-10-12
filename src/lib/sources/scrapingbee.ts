import { env, NotConfiguredError } from "../env";
import { fetchWithTimeout, redact } from "./http";

const BASE = "https://app.scrapingbee.com/api/v1";

export type Strategy = "render" | "premium" | "stealth";

export interface PageResult {
  html: string;
  status: number;
  credits: number;
  strategy: Strategy;
}

function cost(res: Response, fallback: number) {
  const n = Number(res.headers.get("spb-cost"));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const BLOCKED = /(cf-chl|captcha|access denied|attention required|are you a robot|verify you are human)/i;

/**
 * Fetches a page through ScrapingBee with JavaScript rendering, escalating to premium
 * then stealth proxies when the site blocks us. Each escalation costs more credits,
 * so the caller passes how far it is willing to go.
 */
export async function scrapePage(url: string, opts: { maxStrategy?: Strategy; startAt?: Strategy; deadlineMs?: number } = {}): Promise<PageResult> {
  if (!env.scrapingBeeKey) throw new NotConfiguredError("ScrapingBee");
  const ladder: Strategy[] = ["render", "premium", "stealth"];
  const from = ladder.indexOf(opts.startAt ?? "render");
  const to = ladder.indexOf(opts.maxStrategy ?? "premium");
  let credits = 0;
  let lastError = "";

  for (let i = from; i <= to; i++) {
    const strategy = ladder[i];
    if (opts.deadlineMs && Date.now() > opts.deadlineMs - 8_000) break;
    const p = new URLSearchParams({
      api_key: env.scrapingBeeKey,
      url,
      render_js: "true",
      wait: "2000",
      block_ads: "true",
      timeout: "25000",
    });
    if (strategy === "premium") p.set("premium_proxy", "true");
    if (strategy === "stealth") p.set("stealth_proxy", "true");
    if (strategy !== "render") p.set("country_code", "in");

    try {
      const res = await fetchWithTimeout(`${BASE}/?${p}`, { timeoutMs: 32_000, retries: 0 });
      credits += cost(res, strategy === "render" ? 5 : strategy === "premium" ? 25 : 75);
      const html = await res.text();
      if (res.status === 401) throw new Error("ScrapingBee rejected the API key (401).");
      if (res.status === 402 || /credit/i.test(res.statusText)) throw new Error("ScrapingBee account is out of credits.");
      if (res.ok && html.length > 1500 && !BLOCKED.test(html.slice(0, 20000))) {
        return { html, status: res.status, credits, strategy };
      }
      lastError = res.ok ? "Page looked blocked or empty" : `HTTP ${res.status}: ${redact(html).slice(0, 160)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (/401|out of credits/.test(lastError)) throw Object.assign(new Error(lastError), { credits });
    }
  }
  throw Object.assign(new Error(`ScrapingBee could not load ${new URL(url).hostname}: ${lastError}`), { credits });
}

export interface SearchHit {
  url: string;
  title: string;
  description: string;
}

/** Google results through ScrapingBee's search endpoint, localised to India. */
export async function googleSearch(query: string): Promise<{ hits: SearchHit[]; credits: number }> {
  if (!env.scrapingBeeKey) throw new NotConfiguredError("ScrapingBee");
  const p = new URLSearchParams({
    api_key: env.scrapingBeeKey,
    search: query,
    country_code: "in",
    language: "en",
    nb_results: "10",
  });
  const res = await fetchWithTimeout(`${BASE}/store/google?${p}`, { timeoutMs: 25_000 });
  const credits = cost(res, 10);
  if (res.status === 401) throw new Error("ScrapingBee rejected the API key (401).");
  if (!res.ok) throw Object.assign(new Error(`ScrapingBee search ${res.status}: ${redact(await res.text()).slice(0, 160)}`), { credits });
  const json = (await res.json()) as { organic_results?: { url?: string; title?: string; description?: string }[] };
  const hits = (json.organic_results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ url: r.url!, title: r.title ?? "", description: r.description ?? "" }));
  return { hits, credits };
}

export async function scrapingBeeUsage(): Promise<{ max: number; used: number } | null> {
  if (!env.scrapingBeeKey) return null;
  try {
    const res = await fetchWithTimeout(`${BASE}/usage?api_key=${encodeURIComponent(env.scrapingBeeKey)}`, { timeoutMs: 8_000 });
    if (!res.ok) return null;
    const j = (await res.json()) as { max_api_credit?: number; used_api_credit?: number };
    return { max: j.max_api_credit ?? 0, used: j.used_api_credit ?? 0 };
  } catch {
    return null;
  }
}
