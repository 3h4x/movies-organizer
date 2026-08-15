// tamtam inspected 2026-05-21
import { describe, expect, it } from "vitest";
import { shouldSubmitApiKey } from "@/components/ConfigPanel";

describe("ConfigPanel TMDb API key submit guard", () => {
  it("blocks Enter submissions when the API key field is empty", () => {
    expect(shouldSubmitApiKey("", false)).toBe(false);
    expect(shouldSubmitApiKey("   ", false)).toBe(false);
  });

  it("blocks duplicate submissions while the API key is saving", () => {
    expect(shouldSubmitApiKey("tmdb-token", true)).toBe(false);
  });

  it("allows save submissions when a non-empty API key is entered", () => {
    expect(shouldSubmitApiKey("tmdb-token", false)).toBe(true);
  });
});
