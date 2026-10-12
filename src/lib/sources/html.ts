import * as cheerio from "cheerio";

export interface ReducedPage {
  title: string;
  text: string;
  jsonLd: unknown[];
  links: { href: string; text: string }[];
}

/**
 * Shrinks a rendered page to what an extractor needs: visible text, schema.org JSON-LD
 * (many ticketing pages embed Event objects), and outbound event links. Keeps Gemini
 * input small, which keeps it fast and cheap.
 */
export function reduceHtml(html: string, baseUrl: string, maxChars = 22_000): ReducedPage {
  const $ = cheerio.load(html);
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      jsonLd.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  });

  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href") ?? "";
    let href: string;
    try {
      href = new URL(raw, baseUrl).toString();
    } catch {
      return;
    }
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 120);
    if (!seen.has(href) && /event|show|concert|tour|music|buytickets|tickets/i.test(href)) {
      seen.add(href);
      links.push({ href, text });
    }
  });

  $("script, style, noscript, svg, iframe, header nav, footer").remove();
  const title = $("title").first().text().trim();
  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();

  return { title, text: text.slice(0, maxChars), jsonLd: jsonLd.slice(0, 40), links: links.slice(0, 80) };
}

/** Pulls schema.org Event objects out of JSON-LD, including ones nested in @graph or ItemList. */
export function jsonLdEvents(nodes: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (n: unknown, depth = 0) => {
    if (!n || typeof n !== "object" || depth > 5) return;
    if (Array.isArray(n)) return n.forEach((x) => visit(x, depth + 1));
    const o = n as Record<string, unknown>;
    const type = o["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && /Event$/.test(t))) out.push(o);
    for (const k of ["@graph", "itemListElement", "item", "subEvent", "event"]) if (o[k]) visit(o[k], depth + 1);
  };
  visit(nodes);
  return out.slice(0, 30);
}
