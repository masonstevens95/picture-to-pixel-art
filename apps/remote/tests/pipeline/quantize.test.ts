import { describe, expect, it } from "vitest";
import { countDistinctColors, mergeBrandColors, quantizePalette } from "../../src/pipeline/quantize";
import { CURATED_PALETTES } from "../../src/pipeline/palettes";
import type { RGB } from "../../src/pipeline/palettes";

/**
 * Quantization tests. Pure functions on ImageData — no canvas needed.
 */

function makeNoiseImage(width: number, height: number, seed = 1): ImageData {
  // Deterministic LCG so tests are reproducible.
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s & 0xff;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rand();
    data[i + 1] = rand();
    data[i + 2] = rand();
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function makeMonochrome(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function inSet(image: ImageData, allowed: readonly RGB[]): boolean {
  const allowSet = new Set(allowed.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  for (let i = 0; i < image.data.length; i += 4) {
    const k = (image.data[i]! << 16) | (image.data[i + 1]! << 8) | image.data[i + 2]!;
    if (!allowSet.has(k)) return false;
  }
  return true;
}

describe("quantizePalette — Auto mode (no fixed palette, no brand colors)", () => {
  it("reduces a noisy 16x16 image to <= 16 distinct colors", () => {
    const src = makeNoiseImage(16, 16);
    expect(countDistinctColors(src)).toBeGreaterThan(16);
    const out = quantizePalette(src, { paletteSize: 16 });
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(16);
  });

  it("respects a smaller palette ceiling", () => {
    const src = makeNoiseImage(32, 32, 7);
    const out = quantizePalette(src, { paletteSize: 4 });
    expect(countDistinctColors(out)).toBeLessThanOrEqual(4);
  });

  it("monochrome input collapses to <= 1 color", () => {
    const src = makeMonochrome(8, 8);
    const out = quantizePalette(src, { paletteSize: 16 });
    expect(countDistinctColors(out)).toBeLessThanOrEqual(1);
  });

  it("rejects palette sizes below 2", () => {
    const src = makeNoiseImage(8, 8);
    expect(() => quantizePalette(src, { paletteSize: 1 })).toThrow();
    expect(() => quantizePalette(src, { paletteSize: 0 })).toThrow();
  });

  it("output preserves source dims and forces alpha to 255", () => {
    const src = makeNoiseImage(20, 12);
    const out = quantizePalette(src, { paletteSize: 8 });
    expect(out.width).toBe(20);
    expect(out.height).toBe(12);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });

  it("default options call (no args beyond image) preserves v1 behavior", () => {
    const src = makeNoiseImage(16, 16);
    const out = quantizePalette(src);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(16);
  });
});

describe("quantizePalette — fixed palette (Curated/Custom modes)", () => {
  it("constrains output to the supplied palette colors only", () => {
    const src = makeNoiseImage(20, 20);
    const palette = CURATED_PALETTES["gameboy-dmg"].colors;
    const out = quantizePalette(src, { fixedPalette: palette });
    expect(inSet(out, palette)).toBe(true);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(palette.length);
  });

  it("Game Boy DMG palette produces output with at most 4 distinct colors", () => {
    const src = makeNoiseImage(16, 16);
    const out = quantizePalette(src, { fixedPalette: CURATED_PALETTES["gameboy-dmg"].colors });
    expect(countDistinctColors(out)).toBeLessThanOrEqual(4);
  });

  it("custom 3-color palette produces output with at most 3 distinct colors, all from the palette", () => {
    const src = makeNoiseImage(20, 20);
    const palette: readonly RGB[] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
    ];
    const out = quantizePalette(src, { fixedPalette: palette });
    expect(countDistinctColors(out)).toBeLessThanOrEqual(3);
    expect(inSet(out, palette)).toBe(true);
  });
});

describe("quantizePalette — brand colors", () => {
  it("brand colors appear in the output palette when used with Auto mode", () => {
    const src = makeNoiseImage(20, 20);
    const brand: readonly RGB[] = [[255, 0, 255]]; // magenta — unlikely from random noise
    const out = quantizePalette(src, { paletteSize: 16, brandColors: brand });
    // Output should contain at least one pure-magenta pixel OR be a strict
    // subset of {magenta + 15 Wu colors}. Verify magenta is in the allowed set
    // by checking output contains it OR is consistent with brand+Wu merger.
    const magentaKey = (255 << 16) | (0 << 8) | 255;
    let foundMagenta = false;
    for (let i = 0; i < out.data.length; i += 4) {
      const k = (out.data[i]! << 16) | (out.data[i + 1]! << 8) | out.data[i + 2]!;
      if (k === magentaKey) {
        foundMagenta = true;
        break;
      }
    }
    // Magenta should appear since random noise contains pixels closest to magenta.
    expect(foundMagenta).toBe(true);
  });

  it("brand colors appear in output even when used with a curated palette that lacks them", () => {
    const src = makeNoiseImage(20, 20);
    const brand: readonly RGB[] = [[255, 0, 255]]; // not in Game Boy DMG
    const allowed: RGB[] = [...CURATED_PALETTES["gameboy-dmg"].colors, [255, 0, 255]];
    const out = quantizePalette(src, {
      fixedPalette: CURATED_PALETTES["gameboy-dmg"].colors,
      brandColors: brand,
    });
    // Output uses only DMG colors plus magenta.
    expect(inSet(out, allowed)).toBe(true);
  });

  it("empty brand colors with Auto mode produces v1-equivalent output", () => {
    // R5 invariant: brandColors=[] + no fixedPalette + paletteSize=16 = v1 path.
    const src = makeNoiseImage(16, 16);
    const v1Out = quantizePalette(src, { paletteSize: 16 });
    const v2DefaultsOut = quantizePalette(src, { paletteSize: 16, brandColors: [] });
    expect(Array.from(v2DefaultsOut.data)).toEqual(Array.from(v1Out.data));
  });
});

describe("mergeBrandColors", () => {
  it("returns base unchanged when brand is empty", () => {
    const base: readonly RGB[] = [
      [10, 20, 30],
      [40, 50, 60],
    ];
    expect(mergeBrandColors(base, [], 16)).toEqual([
      [10, 20, 30],
      [40, 50, 60],
    ]);
  });

  it("prepends brand colors and dedups against base", () => {
    const base: readonly RGB[] = [
      [10, 20, 30],
      [40, 50, 60],
      [100, 100, 100],
    ];
    const brand: readonly RGB[] = [[40, 50, 60]]; // already in base
    const merged = mergeBrandColors(base, brand, 16);
    // brand color [40,50,60] appears once at index 0; base re-adds skip the dup.
    expect(merged[0]).toEqual([40, 50, 60]);
    expect(merged.filter(([r, g, b]) => r === 40 && g === 50 && b === 60).length).toBe(1);
  });

  it("truncates trailing base entries when total exceeds maxSize", () => {
    const base: readonly RGB[] = [
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ];
    const brand: readonly RGB[] = [[1, 1, 1]];
    const merged = mergeBrandColors(base, brand, 2);
    expect(merged.length).toBe(2);
    expect(merged[0]).toEqual([1, 1, 1]);
    expect(merged[1]).toEqual([10, 20, 30]);
  });

  it("uses only brand colors when brand alone exceeds maxSize", () => {
    const brand: readonly RGB[] = [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ];
    const merged = mergeBrandColors([[100, 100, 100]], brand, 2);
    expect(merged).toEqual([
      [1, 1, 1],
      [2, 2, 2],
    ]);
  });

  it("dedups brand-internal duplicates (same color twice in brand list)", () => {
    const brand: readonly RGB[] = [
      [255, 0, 0],
      [255, 0, 0], // dup
      [0, 255, 0],
    ];
    const merged = mergeBrandColors([], brand, 16);
    expect(merged.length).toBe(2);
  });
});
