import { describe, expect, it } from "vitest";
import { eventKey, matchArtist, normalizeCity, normalizeName, slugify, sourceFromUrl } from "../src/lib/normalize";

const artists = [
  { id: "1", name: "Prateek Kuhad", slug: "prateek-kuhad", aliases: [] },
  { id: "2", name: "The Local Train", slug: "the-local-train", aliases: ["Local Train"] },
  { id: "3", name: "Dot.", slug: "dot", aliases: ["Dot"] },
  { id: "4", name: "KR$NA", slug: "krsna", aliases: ["Krsna"] },
  { id: "5", name: "Guns N' Roses", slug: "guns-n-roses", aliases: ["GNR"] },
];

describe("normalizeCity", () => {
  it("maps Bangalore spellings and neighbourhoods to Bengaluru", () => {
    for (const s of ["Bangalore", "Bengaluru", "BLR", "Whitefield, Bengaluru", "Koramangala", "bengaluru urban"]) {
      expect(normalizeCity(s)?.slug).toBe("bengaluru");
    }
  });
  it("groups NCR", () => {
    expect(normalizeCity("Gurugram")?.slug).toBe("delhi-ncr");
    expect(normalizeCity("New Delhi")?.label).toBe("Delhi NCR");
  });
  it("keeps unknown cities as-is", () => {
    expect(normalizeCity("Dehradun")).toEqual({ slug: "dehradun", label: "Dehradun" });
  });
});

describe("matchArtist", () => {
  it("strips tour noise", () => {
    expect(matchArtist("Prateek Kuhad Live - India Tour 2026", artists)?.artist.id).toBe("1");
    expect(normalizeName("Prateek Kuhad Live")).toBe("prateek kuhad");
  });
  it("matches aliases", () => {
    expect(matchArtist("Local Train live in Bangalore", artists)?.artist.id).toBe("2");
    expect(matchArtist("KRSNA", artists)?.artist.id).toBe("4");
  });
  it("tolerates small typos", () => {
    const m = matchArtist("Prateek Kohad", artists);
    expect(m?.artist.id).toBe("1");
    expect(m!.score).toBeGreaterThan(0.85);
  });
  it("flags short names as ambiguous instead of trusting them", () => {
    const m = matchArtist("Dot. live at Blue Frog", artists);
    expect(m?.artist.id).toBe("3");
    expect(m?.ambiguous).toBe(true);
  });
  it("does not match unrelated acts", () => {
    expect(matchArtist("Arijit Singh", artists)).toBeNull();
  });
});

describe("keys and sources", () => {
  it("builds stable keys", () => {
    expect(eventKey(slugify("Guns N' Roses"), "bengaluru", "2026-11-14")).toBe("guns-n-roses|bengaluru|2026-11-14");
  });
  it("recognises ticketing hosts", () => {
    expect(sourceFromUrl("https://in.bookmyshow.com/events/x/ET0001")).toBe("bookmyshow");
    expect(sourceFromUrl("https://www.district.in/events/abc")).toBe("district");
    expect(sourceFromUrl("https://example.com")).toBe("web");
  });
});
