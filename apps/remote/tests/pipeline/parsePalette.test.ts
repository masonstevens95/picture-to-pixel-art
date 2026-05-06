import { describe, expect, it } from "vitest";
import { parsePalette, PALETTE_MAX_COLORS } from "../../src/pipeline/parsePalette";

describe("parsePalette", () => {
  it("parses 6-digit hex codes separated by newlines", () => {
    const result = parsePalette("#ff0000\n#00ff00\n#0000ff");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.colors).toEqual([
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ]);
      expect(result.truncated).toBe(false);
    }
  });

  it("parses 3-digit shorthand and expands to full bytes", () => {
    const result = parsePalette("#f00 #0f0 #00f");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.colors).toEqual([
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ]);
    }
  });

  it("accepts whitespace and comma separators interchangeably", () => {
    const result = parsePalette("  ff0000 , 00ff00  \t #0000ff");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.colors.length).toBe(3);
    }
  });

  it("accepts hex codes without leading #", () => {
    const result = parsePalette("ff0000 00ff00");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.colors).toEqual([
        [255, 0, 0],
        [0, 255, 0],
      ]);
    }
  });

  it("is case-insensitive", () => {
    const lower = parsePalette("#aabbcc");
    const upper = parsePalette("#AABBCC");
    expect(lower.ok && upper.ok).toBe(true);
    if (lower.ok && upper.ok) {
      expect(lower.colors).toEqual(upper.colors);
    }
  });

  it("returns badToken for malformed input", () => {
    const result = parsePalette("#ff0000 not-a-color #00ff00");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.badToken).toBe("not-a-color");
      expect(result.error).toContain("not-a-color");
    }
  });

  it("rejects empty input with a descriptive error", () => {
    const result = parsePalette("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least one/i);
    }
  });

  it("rejects whitespace-only input", () => {
    const result = parsePalette("   \n  \t  ");
    expect(result.ok).toBe(false);
  });

  it("silently truncates at the 64-color cap (overflow flagged via truncated flag)", () => {
    const tokens: string[] = [];
    for (let i = 0; i < 80; i++) {
      const v = i.toString(16).padStart(2, "0");
      tokens.push(`#${v}${v}${v}`);
    }
    const result = parsePalette(tokens.join("\n"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.colors.length).toBe(PALETTE_MAX_COLORS);
      expect(result.truncated).toBe(true);
    }
  });

  it("reports truncated:false when below the cap", () => {
    const result = parsePalette("#000000\n#ffffff");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.truncated).toBe(false);
  });

  it("rejects 5-digit and 7-digit hex (wrong length)", () => {
    expect(parsePalette("#ffaa0").ok).toBe(false);
    expect(parsePalette("#ffaa0011").ok).toBe(false);
  });
});
