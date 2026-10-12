import { describe, expect, it } from "vitest";
import { budgetFor, MAX_FETCH_MS, MIN_FETCH_MS } from "../src/lib/sources/scrapingbee";

describe("budgetFor", () => {
  it("allows the full window when no deadline is set", () => {
    expect(budgetFor(undefined, MAX_FETCH_MS)).toBe(MAX_FETCH_MS);
  });

  it("never exceeds the cap even with a distant deadline", () => {
    expect(budgetFor(Date.now() + 5 * 60_000, MAX_FETCH_MS)).toBe(MAX_FETCH_MS);
  });

  it("shrinks to the time actually left before the deadline", () => {
    const left = budgetFor(Date.now() + 20_000, MAX_FETCH_MS);
    expect(left).toBeGreaterThan(18_000);
    expect(left).toBeLessThanOrEqual(20_000);
  });

  it("goes non-positive once the deadline has passed, so callers stop", () => {
    expect(budgetFor(Date.now() - 1_000, MAX_FETCH_MS)).toBeLessThanOrEqual(0);
  });

  it("falls under the minimum when too little time remains to be useful", () => {
    expect(budgetFor(Date.now() + 3_000, MAX_FETCH_MS)).toBeLessThan(MIN_FETCH_MS);
  });

  it("a request can never outlive the step deadline", () => {
    const deadline = Date.now() + 20_000;
    expect(Date.now() + budgetFor(deadline, MAX_FETCH_MS)).toBeLessThanOrEqual(deadline);
  });
});
