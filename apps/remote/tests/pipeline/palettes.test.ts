import { describe, expect, it } from "vitest";
import {
  CURATED_PALETTE_IDS,
  CURATED_PALETTES,
  getCuratedPalette,
} from "../../src/pipeline/palettes";

describe("CURATED_PALETTES", () => {
  it("has the expected ids", () => {
    expect([...CURATED_PALETTE_IDS]).toEqual(["gameboy-dmg", "pico-8", "ega-16"]);
  });

  it("every palette has a name and 1-64 RGB colors", () => {
    for (const id of CURATED_PALETTE_IDS) {
      const palette = CURATED_PALETTES[id];
      expect(palette.name).toBeTruthy();
      expect(palette.colors.length).toBeGreaterThan(0);
      expect(palette.colors.length).toBeLessThanOrEqual(64);
      for (const [r, g, b] of palette.colors) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    }
  });

  it("Game Boy DMG has exactly 4 colors", () => {
    expect(CURATED_PALETTES["gameboy-dmg"].colors.length).toBe(4);
  });

  it("PICO-8 has exactly 16 colors", () => {
    expect(CURATED_PALETTES["pico-8"].colors.length).toBe(16);
  });

  it("EGA-16 has exactly 16 colors", () => {
    expect(CURATED_PALETTES["ega-16"].colors.length).toBe(16);
  });

  it("getCuratedPalette throws on unknown id", () => {
    expect(() => getCuratedPalette("nope" as never)).toThrow();
  });
});
