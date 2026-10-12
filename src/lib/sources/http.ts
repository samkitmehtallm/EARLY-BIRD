/** fetch with a hard timeout and a readable error. Retries once on 429/5xx/network errors. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, retries = 1, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...rest, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 800 * (attempt + 1);
        await sleep(Math.min(wait, 3000));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(msg.includes("aborted") || msg.includes("timeout") ? `Timed out after ${timeoutMs / 1000}s` : msg);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Redacts api keys from URLs before they reach logs or the UI. */
export function redact(s: string) {
  return s.replace(/(api_key|apikey|app_id|key)=([^&\s]+)/gi, "$1=•••");
}
