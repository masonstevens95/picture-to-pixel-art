import { describe, expect, it } from "vitest";
import { DEFAULT_XDOG_PARAMS, xdog } from "../../src/pipeline/xdog";

/**
 * XDoG (U4) tests.
 *
 * The defining XDoG behaviors checked here:
 *   - flat input → no edges (the DC-preserving Gaussian + tanh threshold
 *     should suppress everything; verifies normalization correctness)
 *   - rectangular high-contrast subject → mask traces the boundary
 *   - noisy textured input → sparse mask (the XDoG-vs-Sobel quality signal —
 *     Sobel would fire on every pixel; XDoG's tanh threshold does not)
 *   - small inputs (1×1, 3×3) don't crash and return a valid mask shape
 */

function solidLuminance(width: number, height: number, value: number): Float32Array {
  const buf = new Float32Array(width * height);
  buf.fill(value);
  return buf;
}

function darkSquareOnLight(
  width: number,
  height: number,
  squareInset: number,
): Float32Array {
  const buf = new Float32Array(width * height);
  buf.fill(220); // light background
  for (let y = squareInset; y < height - squareInset; y++) {
    for (let x = squareInset; x < width - squareInset; x++) {
      buf[y * width + x] = 30; // dark square
    }
  }
  return buf;
}

function noisyLuminance(
  width: number,
  height: number,
  base: number,
  amplitude: number,
  seed = 42,
): Float32Array {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xff) / 255;
  };
  const buf = new Float32Array(width * height);
  for (let i = 0; i < buf.length; i++) {
    const jitter = (rand() - 0.5) * 2 * amplitude;
    buf[i] = Math.max(0, Math.min(255, base + jitter));
  }
  return buf;
}

function countEdges(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 255) count++;
  return count;
}

describe("xdog", () => {
  it("solid-color luminance produces a mask with no edges", () => {
    const luma = solidLuminance(20, 20, 128);
    const mask = xdog(luma, 20, 20);
    expect(mask.length).toBe(400);
    expect(countEdges(mask)).toBe(0);
  });

  it("solid-color luminance at extremes (0 and 255) also produces no edges", () => {
    const black = xdog(solidLuminance(15, 15, 0), 15, 15);
    const white = xdog(solidLuminance(15, 15, 255), 15, 15);
    expect(countEdges(black)).toBe(0);
    expect(countEdges(white)).toBe(0);
  });

  it("dark square on light background produces a roughly rectangular outline", () => {
    const w = 30;
    const h = 30;
    const inset = 10; // 10×10 dark square inside a 30×30 field
    const luma = darkSquareOnLight(w, h, inset);
    const mask = xdog(luma, w, h);

    // Far-exterior corner (well outside the square) should not be marked.
    expect(mask[0]).toBe(0);
    expect(mask[w - 1]).toBe(0);

    // Deep interior of the dark square should not be marked (flat region).
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    expect(mask[cy * w + cx]).toBe(0);

    // Boundary perimeter for a 10×10 square = 4·10 − 4 = 36. Allow a wide
    // tolerance because the Gaussian blur diffuses the edge over a
    // 1–2-pixel band; we just want "non-trivial outline of the right
    // approximate size", not pixel-exact positioning.
    const edgeCount = countEdges(mask);
    expect(edgeCount).toBeGreaterThan(20);
    expect(edgeCount).toBeLessThan(120);
  });

  it("noisy textured luminance produces a sparse mask (XDoG-vs-Sobel quality signature)", () => {
    const w = 40;
    const h = 40;
    const luma = noisyLuminance(w, h, 128, 25); // ±25 jitter around mid-gray
    const mask = xdog(luma, w, h);
    const total = w * h;
    const edges = countEdges(mask);
    // Sobel at threshold 50 would fire on most of these pixels (random
    // jitter trivially crosses the magnitude cutoff). XDoG's tanh threshold
    // suppresses low-contrast noise — assert <30% of pixels are edges.
    expect(edges / total).toBeLessThan(0.3);
  });

  it("3×3 input does not crash and returns a 9-element mask", () => {
    const luma = solidLuminance(3, 3, 100);
    const mask = xdog(luma, 3, 3);
    expect(mask.length).toBe(9);
    expect(countEdges(mask)).toBe(0); // flat input, no edges
  });

  it("1×1 input does not crash (kernel clamps work at minimum size)", () => {
    const luma = new Float32Array([128]);
    const mask = xdog(luma, 1, 1);
    expect(mask.length).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it("0×0 (empty) input returns an empty mask without crashing", () => {
    const mask = xdog(new Float32Array(0), 0, 0);
    expect(mask.length).toBe(0);
  });

  it("respects custom params (raising ε suppresses more edges)", () => {
    const w = 30;
    const h = 30;
    const luma = darkSquareOnLight(w, h, 10);
    const baseline = xdog(luma, w, h);
    const conservative = xdog(luma, w, h, { ...DEFAULT_XDOG_PARAMS, epsilon: 0.5 });
    // ε is the |DoG| threshold; a larger ε requires a stronger gradient
    // to qualify as an edge, so fewer pixels are marked. Defaults keep
    // ε=0.1; raising it should monotonically reduce the edge count.
    expect(countEdges(conservative)).toBeLessThanOrEqual(countEdges(baseline));
  });

  it("throws on luminance length / dims mismatch", () => {
    const luma = new Float32Array(5);
    expect(() => xdog(luma, 3, 3)).toThrow();
  });
});
