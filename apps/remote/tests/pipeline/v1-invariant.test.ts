import { describe, expect, it } from "vitest";
import { areaAverageDownscale } from "../../src/pipeline/downscale";
import { quantizePalette } from "../../src/pipeline/quantize";
import { saturationAdjust } from "../../src/pipeline/saturation";
import { centerCrop } from "../../src/pipeline/crop";

/**
 * R5 invariant: with every v2 control at its default (Source aspect,
 * 0 saturation, Auto palette, no brand colors), the v2 pipeline produces
 * output bit-identical to a v1-equivalent pipeline.
 *
 * This test does NOT round-trip through the worker (no OffscreenCanvas in
 * jsdom). It exercises the pure-function pipeline stages directly:
 *   v2:  saturationAdjust(0) → centerCrop(if ratio set) → downscale → quantize(no options)
 *   v1:  downscale → quantize(no options)
 *
 * The saturationAdjust short-circuit at amount=0 returns the input
 * unchanged (verified in saturation.test.ts), and centerCrop is skipped
 * entirely when aspectRatio is undefined. So the v2-default path collapses
 * to "downscale → quantize", which is exactly v1.
 */

function makeFixture(width: number, height: number, seed = 42): ImageData {
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

function v1Pipeline(source: ImageData, targetLongEdge: number): ImageData {
  const longEdge = Math.max(source.width, source.height);
  const scale = targetLongEdge >= longEdge ? 1 : targetLongEdge / longEdge;
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));
  const downscaled = areaAverageDownscale(source, targetW, targetH);
  return quantizePalette(downscaled);
}

function v2DefaultPipeline(source: ImageData, targetLongEdge: number): ImageData {
  // All v2 controls at default: saturation=0 (short-circuits), aspectRatio=undefined
  // (no crop), paletteMode=auto (no fixedPalette), brandColors=undefined.
  const adjusted = saturationAdjust(source, 0);
  const cropped = adjusted; // aspectRatio undefined → no crop step
  const longEdge = Math.max(cropped.width, cropped.height);
  const scale = targetLongEdge >= longEdge ? 1 : targetLongEdge / longEdge;
  const targetW = Math.max(1, Math.round(cropped.width * scale));
  const targetH = Math.max(1, Math.round(cropped.height * scale));
  const downscaled = areaAverageDownscale(cropped, targetW, targetH);
  return quantizePalette(downscaled, {});
}

describe("v1-default invariant (R5)", () => {
  it("v2 with all defaults produces byte-identical output to v1 for a 64x48 fixture", () => {
    const source = makeFixture(64, 48);
    const v1 = v1Pipeline(source, 32);
    const v2 = v2DefaultPipeline(source, 32);
    expect(v2.width).toBe(v1.width);
    expect(v2.height).toBe(v1.height);
    expect(Array.from(v2.data)).toEqual(Array.from(v1.data));
  });

  it("v2 with all defaults produces byte-identical output to v1 for a 100x100 fixture at 64", () => {
    const source = makeFixture(100, 100, 99);
    const v1 = v1Pipeline(source, 64);
    const v2 = v2DefaultPipeline(source, 64);
    expect(Array.from(v2.data)).toEqual(Array.from(v1.data));
  });

  it("negative control: saturation=-1 produces output that is NOT byte-equal to v1", () => {
    // Sanity check that the test would actually fail under a real regression.
    const source = makeFixture(64, 48);
    const v1 = v1Pipeline(source, 32);
    const adjusted = saturationAdjust(source, -1);
    const downscaled = areaAverageDownscale(adjusted, 32, 24);
    const v2Saturated = quantizePalette(downscaled);
    // At least one byte differs.
    let diff = false;
    for (let i = 0; i < v1.data.length; i++) {
      if (v1.data[i] !== v2Saturated.data[i]) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it("centerCrop with no-op ratio (matching source) is also byte-identical", () => {
    const source = makeFixture(80, 80);
    const cropped = centerCrop(source, 1); // 1:1 source matches exactly → no-op
    expect(cropped).toBe(source); // same reference
  });
});
