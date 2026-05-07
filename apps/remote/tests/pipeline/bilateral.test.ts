import { describe, expect, it } from "vitest";
import { bilateralFilter, type SmoothnessLevel } from "../../src/pipeline/bilateral";

/**
 * Bilateral filter (U3) tests.
 *
 * The R12 invariant case ('off' → input by reference) is what the v3-
 * default invariant test in v1-invariant.test.ts implicitly relies on —
 * any regression in the short-circuit there would surface byte-diffs in
 * that file as well. The remaining cases verify the filter's defining
 * properties (flat regions stay flat, edges stay sharp, alpha bypasses,
 * variance drops on noisy input) without pinning exact pixel values,
 * which would over-couple the test to the kernel constants.
 */

const ALL_LEVELS: ReadonlyArray<SmoothnessLevel> = ["off", "low", "medium", "high"];
const SMOOTHING_LEVELS: ReadonlyArray<Exclude<SmoothnessLevel, "off">> = [
  "low",
  "medium",
  "high",
];

function makeSolid(width: number, height: number, rgb: [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function makeBlackWhiteHalves(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const mid = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = x < mid ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function makeNoisy(
  width: number,
  height: number,
  base: [number, number, number],
  amplitude: number,
  seed = 1,
): ImageData {
  // Deterministic LCG for reproducible noise.
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s & 0xffff) / 0xffff) * 2 - 1; // -1..+1
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, base[0] + rand() * amplitude));
      data[i + 1] = Math.max(0, Math.min(255, base[1] + rand() * amplitude));
      data[i + 2] = Math.max(0, Math.min(255, base[2] + rand() * amplitude));
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function variance(image: ImageData, x0: number, y0: number, x1: number, y1: number): number {
  // Per-channel variance averaged across R/G/B over the inclusive rectangle.
  const w = image.width;
  const data = image.data;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      sumR += data[i]!;
      sumG += data[i + 1]!;
      sumB += data[i + 2]!;
      count++;
    }
  }
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  let varR = 0;
  let varG = 0;
  let varB = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      varR += (data[i]! - meanR) ** 2;
      varG += (data[i + 1]! - meanG) ** 2;
      varB += (data[i + 2]! - meanB) ** 2;
    }
  }
  return (varR + varG + varB) / (3 * count);
}

describe("bilateralFilter", () => {
  it("R12: smoothness='off' returns the input ImageData unchanged (same reference)", () => {
    const input = makeSolid(8, 8, [120, 80, 200]);
    const out = bilateralFilter(input, "off");
    expect(out).toBe(input); // reference-equality, byte-identical by construction
    expect(out.data).toBe(input.data);
    expect(out.width).toBe(input.width);
    expect(out.height).toBe(input.height);
  });

  it.each(SMOOTHING_LEVELS)(
    "solid-color input is preserved at smoothness=%s (within ±1/255 rounding)",
    (level) => {
      const rgb: [number, number, number] = [120, 80, 200];
      const input = makeSolid(16, 16, rgb);
      const out = bilateralFilter(input, level);
      // Solid input → bilateral is a perfect no-op in the limit; rounding
      // can introduce ±1 per channel.
      for (let i = 0; i < out.data.length; i += 4) {
        expect(Math.abs(out.data[i]! - rgb[0])).toBeLessThanOrEqual(1);
        expect(Math.abs(out.data[i + 1]! - rgb[1])).toBeLessThanOrEqual(1);
        expect(Math.abs(out.data[i + 2]! - rgb[2])).toBeLessThanOrEqual(1);
      }
    },
  );

  it("preserves a sharp black/white edge at smoothness=medium (boundary pixels stay near extremes)", () => {
    const w = 32;
    const h = 8;
    const input = makeBlackWhiteHalves(w, h);
    const out = bilateralFilter(input, "medium");
    const mid = Math.floor(w / 2);
    // For each pixel in the pixel column at the boundary or within ±5px,
    // assert the channel value is either close to 0 or close to 255 — never
    // pulled into the midtones (which is exactly what a non-edge-aware
    // Gaussian blur would produce).
    for (let y = 0; y < h; y++) {
      for (let dx = -5; dx <= 5; dx++) {
        const x = mid + dx;
        if (x < 0 || x >= w) continue;
        const i = (y * w + x) * 4;
        const r = out.data[i]!;
        // Each pixel still belongs to its original side: black side stays
        // dark (≤30/255), white side stays bright (≥225/255). 30/255 ≈
        // 12% — enough headroom for legitimate bilateral edge softening
        // but tight enough to fail if the filter degenerates into a plain
        // Gaussian blur (which would push boundary pixels toward 127).
        if (input.data[i] === 0) {
          expect(r).toBeLessThanOrEqual(30);
        } else {
          expect(r).toBeGreaterThanOrEqual(225);
        }
      }
    }
  });

  it("smoothness=high reduces variance on noisy flat input", () => {
    // 32×32 with mid-gray base and ±20 jitter. Sample variance over a
    // central 16×16 region (avoids edge-clamp artifacts dominating).
    const input = makeNoisy(32, 32, [128, 128, 128], 20, 7);
    const out = bilateralFilter(input, "high");
    const inputVar = variance(input, 8, 8, 23, 23);
    const outputVar = variance(out, 8, 8, 23, 23);
    expect(outputVar).toBeLessThan(inputVar);
    // Should be a substantial reduction — high smoothness on flat noise.
    expect(outputVar).toBeLessThan(inputVar * 0.5);
  });

  it.each(ALL_LEVELS)("alpha channel is preserved untouched at smoothness=%s", (level) => {
    const w = 6;
    const h = 6;
    // Mix of alpha values, including 0 and 255.
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (i * 17) & 0xff;
      data[i + 1] = (i * 31) & 0xff;
      data[i + 2] = (i * 53) & 0xff;
      data[i + 3] = (i * 7) & 0xff; // varied alpha
    }
    const input = new ImageData(data, w, h);
    const alphaSnapshot = Array.from(data).filter((_, idx) => idx % 4 === 3);

    const out = bilateralFilter(input, level);
    for (let i = 0, ai = 0; i < out.data.length; i += 4, ai++) {
      expect(out.data[i + 3]).toBe(alphaSnapshot[ai]);
    }
  });

  it.each(ALL_LEVELS)(
    "1×1 input at smoothness=%s does not crash and preserves the single pixel",
    (level) => {
      const data = new Uint8ClampedArray([200, 100, 50, 128]);
      const input = new ImageData(data, 1, 1);
      const out = bilateralFilter(input, level);
      expect(out.width).toBe(1);
      expect(out.height).toBe(1);
      // Within ±1/255 — the divide-by-self loop should be exact, but allow
      // for round-trip rounding.
      expect(Math.abs(out.data[0]! - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.data[1]! - 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.data[2]! - 50)).toBeLessThanOrEqual(1);
      expect(out.data[3]).toBe(128); // alpha bypass
    },
  );

  it("3×3 input at smoothness=high (window radius 6 exceeds dims) clamps cleanly", () => {
    const input = makeSolid(3, 3, [50, 100, 150]);
    expect(() => bilateralFilter(input, "high")).not.toThrow();
    const out = bilateralFilter(input, "high");
    expect(out.width).toBe(3);
    expect(out.height).toBe(3);
    // Clamped window over a flat 3×3 → still flat.
    for (let i = 0; i < out.data.length; i += 4) {
      expect(Math.abs(out.data[i]! - 50)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.data[i + 1]! - 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.data[i + 2]! - 150)).toBeLessThanOrEqual(1);
    }
  });

  it.each(SMOOTHING_LEVELS)(
    "smoothness=%s allocates a new ImageData (does NOT mutate input)",
    (level) => {
      const input = makeNoisy(8, 8, [128, 128, 128], 30);
      const inputSnapshot = Array.from(input.data);
      const out = bilateralFilter(input, level);
      expect(out).not.toBe(input);
      expect(out.data).not.toBe(input.data);
      // Input bytes unchanged.
      expect(Array.from(input.data)).toEqual(inputSnapshot);
    },
  );
});
