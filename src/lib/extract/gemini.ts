import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env, NotConfiguredError } from "../env";
import { sleep } from "../sources/http";
import { istDate } from "../time";

/** What Gemini must return for every show it finds. */
export const ExtractedShow = z.object({
  listed_artist: z.string().min(1),
  matched_artist: z.string().nullable(),
  title: z.string().nullable(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  ticket_url: z.string().nullable(),
  price_min_inr: z.number().nullable(),
  early_bird_status: z.enum(["available", "upcoming", "sold_out", "none", "unknown"]),
  early_bird_deadline: z.string().nullable(),
  scarcity_signals: z.array(z.string()),
  is_tribute_or_cover: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});
export type ExtractedShow = z.infer<typeof ExtractedShow>;

const nullable = (type: string, description?: string) => ({ type, nullable: true, ...(description ? { description } : {}) });

const responseSchema = {
  type: "OBJECT",
  properties: {
    shows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          listed_artist: { type: "STRING", description: "Artist name exactly as the page lists it" },
          matched_artist: nullable("STRING", "Exact name from WATCHLIST this show belongs to, or null"),
          title: nullable("STRING"),
          venue: nullable("STRING"),
          city: nullable("STRING", "City name, e.g. Bengaluru"),
          country: nullable("STRING", "ISO-2 country code, IN for India"),
          date: nullable("STRING", "YYYY-MM-DD of the show, null if not stated"),
          time: nullable("STRING", "HH:MM 24h local start time, null if not stated"),
          ticket_url: nullable("STRING"),
          price_min_inr: nullable("NUMBER"),
          early_bird_status: { type: "STRING", enum: ["available", "upcoming", "sold_out", "none", "unknown"] },
          early_bird_deadline: nullable("STRING", "ISO 8601 with +05:30, null if not stated"),
          scarcity_signals: { type: "ARRAY", items: { type: "STRING" } },
          is_tribute_or_cover: { type: "BOOLEAN" },
          confidence: { type: "NUMBER" },
          evidence: { type: "STRING", description: "Short verbatim quote (<160 chars) supporting the date and venue" },
        },
        required: [
          "listed_artist", "matched_artist", "title", "venue", "city", "country", "date", "time", "ticket_url",
          "price_min_inr", "early_bird_status", "early_bird_deadline", "scarcity_signals", "is_tribute_or_cover",
          "confidence", "evidence",
        ],
      },
    },
  },
  required: ["shows"],
};

function systemPrompt(today: string) {
  return `You extract live-music shows from messy web content for an alert service in India.
Today is ${today} (Asia/Kolkata, UTC+05:30).

Rules — follow all of them:
1. Only report shows that the CONTENT states. Never infer a date, venue or price that is not written there. Use null when unknown.
2. matched_artist: set it ONLY when the headlining or listed act is one of the WATCHLIST names (allow spelling variants, "Live", "India Tour", "& Band", Bangalore/Bengaluru etc.). Copy the watchlist spelling exactly. If the act is a different person with a similar name, or the watchlist artist is only mentioned (e.g. "songs of", "inspired by"), set null.
3. is_tribute_or_cover = true for tribute nights, cover bands, "a night of X's music", karaoke, DJ sets playing X's songs.
4. country: "IN" only when the show is physically in India. Online/streamed shows → country null.
5. date must be the performance date (not the on-sale date). Past dates (before ${today}) still get reported; the caller filters them.
6. early_bird_status:
   - "available": early-bird / Phase 1 / pre-sale / first-release tickets are on sale now.
   - "upcoming": the page says such tickets open later ("pre-sale starts", "registrations open for early bird").
   - "sold_out": early-bird/Phase 1 explicitly sold out.
   - "none": tickets are on sale with no early-bird tier mentioned and regular phases are live.
   - "unknown": the content does not say.
   early_bird_deadline: when the early tier or pre-sale ends, if stated.
7. scarcity_signals: short phrases from the content such as "limited", "fast filling", "Phase 1 almost sold out", "first 500 tickets".
8. ticket_url: the direct booking link if the content contains it; else the page URL if the page itself sells tickets; else null.
9. confidence: 0.9+ when artist, date and city are all explicit; ~0.6 when one is inferred from context (e.g. a listing card); below 0.5 when unsure.
10. Return {"shows": []} when nothing qualifies. Do not include shows from navigation menus, "you may also like" carousels or ads unless they are watchlist acts.`;
}

let client: GoogleGenAI | null = null;
const ai = () => {
  if (!env.geminiKey) throw new NotConfiguredError("Gemini");
  return (client ??= new GoogleGenAI({ apiKey: env.geminiKey }));
};

export interface ExtractInput {
  sourceLabel: string;
  url: string;
  content: string;
  watchlist: string[];
}

/** Calls Gemini Flash in JSON mode; validates with Zod; one repair retry, backoff on rate limits. */
export async function extractShows(input: ExtractInput): Promise<ExtractedShow[]> {
  const today = istDate();
  const user = `SOURCE: ${input.sourceLabel}
URL: ${input.url}
WATCHLIST (${input.watchlist.length}): ${input.watchlist.join(" | ")}

CONTENT:
"""
${input.content}
"""`;

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: env.geminiModel,
        contents: attempt === 0 || !lastError.startsWith("schema")
          ? user
          : `${user}\n\nYour previous answer failed validation (${lastError}). Return valid JSON matching the schema exactly.`,
        config: {
          systemInstruction: systemPrompt(today),
          responseMimeType: "application/json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseSchema: responseSchema as any,
          temperature: 0,
          maxOutputTokens: 8192,
          ...(/2\.5-flash/.test(env.geminiModel) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      });
      const text = res.text ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastError = "schema: response was not JSON";
        continue;
      }
      const shows = z.object({ shows: z.array(ExtractedShow) }).safeParse(parsed);
      if (!shows.success) {
        lastError = `schema: ${shows.error.issues[0]?.path.join(".")} ${shows.error.issues[0]?.message}`;
        continue;
      }
      return shows.data.shows;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/API key not valid|PERMISSION_DENIED|401|403/i.test(msg)) throw new Error("Gemini rejected the API key.");
      if (/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/i.test(msg) && attempt < 2) {
        lastError = "rate limited";
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Gemini: ${msg.slice(0, 200)}`);
    }
  }
  throw new Error(`Gemini returned unusable output (${lastError}).`);
}

/** Tiny health check for the Settings page. */
export async function pingGemini(): Promise<string> {
  const res = await ai().models.generateContent({
    model: env.geminiModel,
    contents: "Reply with the single word: ready",
    config: { temperature: 0, maxOutputTokens: 10 },
  });
  return (res.text ?? "").trim();
}
