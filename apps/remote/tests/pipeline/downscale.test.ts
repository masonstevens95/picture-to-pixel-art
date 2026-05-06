import { describe, expect, it } from "vitest";
import { areaAverageDownscale } from "../../src/pipeline/downscale";

/**
 * Pure-function tests for the box-filter downscale. ImageData is constructible
 * in jsdom 25 — no canvas needed.
 */

function makeSolidImage(width: number, height: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function makeChecker(width: number, height: number): ImageData {
  // 2x2 checker, repeated. Lets us verify averaging.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const black = (x + y) % 2 === 0;
      const v = black ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe("areaAverageDownscale", () => {
  it("downscales solid color to a smaller solid block", () => {
    const src = makeSolidImage(100, 80, 200, 100, 50);
    const out = areaAverageDownscale(src, 25, 20);
    expect(out.width).toBe(25);
    expect(out.height).toBe(20);
    // Every pixel preserves the source RGB and is fully opaque.
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(200);
      expect(out.data[i + 1]).toBe(100);
      expect(out.data[i + 2]).toBe(50);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  it("collapses 2x2 checker to a uniform mid-gray when downscaling 2x", () => {
    const src = makeChecker(8, 8);
    const out = areaAverageDownscale(src, 4, 4);
    // 2x2 checker averages to 127.5 -> rounds to 128 (half-toward-even is fine,
    // we just want roughly mid-gray, not exact).
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]!).toBeGreaterThanOrEqual(127);
      expect(out.data[i]!).toBeLessThanOrEqual(128);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  it("preserves source dims when target meets or exceeds source (no upscale)", () => {
    const src = makeSolidImage(32, 24, 10, 20, 30);
    const out = areaAverageDownscale(src, 64, 64);
    expect(out.width).toBe(32);
    expect(out.height).toBe(24);
  });

  it("handles aspect-preserving target dims (long-edge = 64 from 4:3 source)", () => {
    const src = makeSolidImage(4000, 3000, 80, 80, 80);
    // 4:3 -> at 64 long edge, height = 48
    const out = areaAverageDownscale(src, 64, 48);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
    // Solid input -> solid output.
    expect(out.data[0]).toBe(80);
    expect(out.data[(63 * 4) + 0]).toBe(80);
  });

  it("forces alpha to 255 even if the source had non-255 alpha", () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100;
      data[i + 1] = 150;
      data[i + 2] = 200;
      data[i + 3] = 64; // semi-transparent input
    }
    const src = new ImageData(data, 4, 4);
    const out = areaAverageDownscale(src, 2, 2);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255);
    }
  });

  it("rejects zero-or-negative target dimensions", () => {
    const src = makeSolidImage(8, 8, 0, 0, 0);
    expect(() => areaAverageDownscale(src, 0, 4)).toThrow();
    expect(() => areaAverageDownscale(src, 4, -1)).toThrow();
  });

  it("downscales a portrait image preserving the long-edge constraint", () => {
    const src = makeSolidImage(600, 800, 50, 50, 50);
    // 3:4 -> at long edge 64, width = 48
    const out = areaAverageDownscale(src, 48, 64);
    expect(out.width).toBe(48);
    expect(out.height).toBe(64);
  });
});
