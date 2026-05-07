import { describe, expect, it } from "vitest";
import { centerCrop } from "../../src/pipeline/crop";
import { chunkify } from "../../src/pipeline/chunky";
import { areaAverageDownscale } from "../../src/pipeline/downscale";
import { applyOutline } from "../../src/pipeline/outline";
import { posterize } from "../../src/pipeline/posterize";
import { quantizePalette } from "../../src/pipeline/quantize";
import { saturationAdjust } from "../../src/pipeline/saturation";

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

/**
 * v3 pipeline at all defaults — identity short-circuits run for each new
 * stage. Should produce output byte-identical to v1 / v2.
 */
function v3DefaultPipeline(source: ImageData, targetLongEdge: number): ImageData {
  const adjusted = saturationAdjust(source, 0); // saturation=0 short-circuits
  const cropped = adjusted; // aspectRatio undefined → no crop
  const posterized = posterize(cropped, undefined); // bands=undefined short-circuits
  const longEdge = Math.max(posterized.width, posterized.height);
  const scale = targetLongEdge >= longEdge ? 1 : targetLongEdge / longEdge;
  const targetW = Math.max(1, Math.round(posterized.width * scale));
  const targetH = Math.max(1, Math.round(posterized.height * scale));
  const downscaled = areaAverageDownscale(posterized, targetW, targetH);
  const outlined = applyOutline(downscaled, { enabled: false, width: 1, color: [0, 0, 0] });
  const quantized = quantizePalette(outlined, { paletteSize: 16 });
  // No silhouette (no mask to apply).
  return chunkify(quantized, 1); // chunkSize=1 short-circuits
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

describe("v3-default invariant (R12)", () => {
  it("v3 with Style=Custom + every transform off + paletteSize=16 produces byte-identical output to v1 (64x48 fixture)", () => {
    const source = makeFixture(64, 48);
    const v1 = v1Pipeline(source, 32);
    const v3 = v3DefaultPipeline(source, 32);
    expect(v3.width).toBe(v1.width);
    expect(v3.height).toBe(v1.height);
    expect(Array.from(v3.data)).toEqual(Array.from(v1.data));
  });

  it("v3 defaults match v1 for a 100x100 fixture at long-edge 64", () => {
    const source = makeFixture(100, 100, 99);
    const v1 = v1Pipeline(source, 64);
    const v3 = v3DefaultPipeline(source, 64);
    expect(Array.from(v3.data)).toEqual(Array.from(v1.data));
  });

  it("negative control: posterizeBands=4 alone produces output that is NOT byte-equal to v1", () => {
    // Sanity check that a single dial drift surfaces as a regression.
    const source = makeFixture(64, 48);
    const v1 = v1Pipeline(source, 32);
    const posterized = posterize(source, 4);
    const downscaled = areaAverageDownscale(posterized, 32, 24);
    const v3Posterized = quantizePalette(downscaled);
    let diff = false;
    for (let i = 0; i < v1.data.length; i++) {
      if (v1.data[i] !== v3Posterized.data[i]) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it("negative control: outlineEnabled=true produces output that is NOT byte-equal to v1", () => {
    const source = makeFixture(64, 48);
    const v1 = v1Pipeline(source, 32);
    const downscaled = areaAverageDownscale(source, 32, 24);
    const outlined = applyOutline(downscaled, {
      enabled: true,
      width: 2,
      color: [0, 0, 0],
    });
    const v3Outlined = quantizePalette(outlined);
    let diff = false;
    for (let i = 0; i < v1.data.length; i++) {
      if (v1.data[i] !== v3Outlined.data[i]) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });
});
