import { describe, expect, it } from "vitest";
import { countDistinctColors, quantizePalette } from "../../src/pipeline/quantize";

/**
 * Quantization tests. Pure functions on ImageData -- no canvas needed.
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

describe("quantizePalette", () => {
  it("reduces a noisy 16x16 image to <= 16 distinct colors", () => {
    const src = makeNoiseImage(16, 16);
    expect(countDistinctColors(src)).toBeGreaterThan(16);
    const out = quantizePalette(src, 16);
    expect(out.width).toBe(16);
    expect(out.height).toBe(16);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(16);
  });

  it("respects a smaller palette ceiling", () => {
    const src = makeNoiseImage(32, 32, 7);
    const out = quantizePalette(src, 4);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(4);
  });

  it("monochrome input collapses to <= 1 color", () => {
    const src = makeMonochrome(8, 8);
    const out = quantizePalette(src, 16);
    expect(countDistinctColors(out)).toBeLessThanOrEqual(1);
  });

  it("rejects palette sizes below 2", () => {
    const src = makeNoiseImage(8, 8);
    expect(() => quantizePalette(src, 1)).toThrow();
    expect(() => quantizePalette(src, 0)).toThrow();
  });

  it("output preserves source dims and forces alpha to 255", () => {
    const src = makeNoiseImage(20, 12);
    const out = quantizePalette(src, 8);
    expect(out.width).toBe(20);
    expect(out.height).toBe(12);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });
});
