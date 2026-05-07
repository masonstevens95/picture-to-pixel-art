import { describe, expect, it } from "vitest";
import { applyFaceBoost } from "../../src/pipeline/faceBoost";
import type { NormalizedLandmark } from "../../src/pipeline/sourceCache";

/**
 * U6 face-boost tests.
 *
 * The boost is a pure function over (image, landmarks, enabled). R12-style
 * identity-by-reference is verified for the off / null-landmarks cases.
 * For the firing path, we use a flat-gray ImageData with a synthetic
 * landmark at a known position and assert that local variance increases
 * after the boost.
 */

const W = 64;
const H = 64;

/**
 * Build a 64×64 ImageData where a 16×16 patch around `(cx, cy)` carries
 * a low-amplitude variance pattern (gray + sin pattern), and the rest is
 * flat gray. This way "local variance increased" is a clean assertion:
 * the boost amplifies the existing pattern.
 */
function makePatchedImage(cx: number, cy: number): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const off = (y * W + x) * 4;
      // Default gray.
      let v = 128;
      // Low-amplitude pattern only inside the eventual window.
      const dx = x - cx;
      const dy = y - cy;
      if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) {
        // Small ±8 perturbation so there's something to amplify.
        v = 128 + (((x + y) % 2) === 0 ? 8 : -8);
      }
      data[off] = v;
      data[off + 1] = v;
      data[off + 2] = v;
      data[off + 3] = 255;
    }
  }
  return new ImageData(data, W, H);
}

/** Compute variance of the R channel across a w×h window starting at (x0, y0). */
function regionVariance(
  image: ImageData,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      sum += image.data[(y * image.width + x) * 4]!;
      n++;
    }
  }
  const mean = sum / n;
  let varSum = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const v = image.data[(y * image.width + x) * 4]!;
      varSum += (v - mean) * (v - mean);
    }
  }
  return varSum / n;
}

/** Build a fake 478-point landmark mesh with the canonical indices set. */
function fakeLandmarks(cx: number, cy: number): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    landmarks.push({ x: 0, y: 0, z: 0, visibility: 0 });
  }
  // Canonical indices used by faceBoost.ts. Co-locate all six features
  // at the same point so the boost's effect is measurable in one window.
  for (const idx of [33, 263, 1, 13, 61, 291]) {
    landmarks[idx] = {
      x: cx / W,
      y: cy / H,
      z: 0,
      visibility: 1,
    };
  }
  return landmarks;
}

describe("applyFaceBoost — R12 identity short-circuits", () => {
  it("enabled=false returns the input ImageData by reference (byte-identical)", () => {
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, fakeLandmarks(32, 32), false);
    expect(out).toBe(img);
  });

  it("landmarks=null returns the input ImageData by reference (no face → no boost)", () => {
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, null, true);
    expect(out).toBe(img);
  });

  it("enabled=false AND landmarks=null still returns input by reference", () => {
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, null, false);
    expect(out).toBe(img);
  });
});

describe("applyFaceBoost — firing path", () => {
  it("local variance in the 16×16 window around a landmark increases after boost", () => {
    const img = makePatchedImage(32, 32);
    const before = regionVariance(img, 24, 24, 16, 16);
    const out = applyFaceBoost(img, fakeLandmarks(32, 32), true);
    const after = regionVariance(out, 24, 24, 16, 16);
    expect(after).toBeGreaterThan(before);
  });

  it("pixels far from any landmark are unchanged (boost is local)", () => {
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, fakeLandmarks(32, 32), true);
    // The far corner (0, 0) has window-edge distance ≥ 32 - 8 = 24, well
    // outside any 16×16 boost window.
    const offIn = 0;
    const offOut = 0;
    expect(out.data[offOut]).toBe(img.data[offIn]);
    expect(out.data[offOut + 1]).toBe(img.data[offIn + 1]);
    expect(out.data[offOut + 2]).toBe(img.data[offIn + 2]);
  });

  it("alpha channel preserved untouched at every pixel", () => {
    const img = makePatchedImage(32, 32);
    // Synthetic non-255 alpha so any silent overwrite would be visible.
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 200;
    const out = applyFaceBoost(img, fakeLandmarks(32, 32), true);
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(200);
    }
  });

  it("returns a NEW ImageData when boost actually fires (not the input reference)", () => {
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, fakeLandmarks(32, 32), true);
    expect(out).not.toBe(img);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
  });
});

describe("applyFaceBoost — edge cases", () => {
  it("landmarks at an image corner (window extends off-image) does not crash and clips to bounds", () => {
    // Landmark at top-left corner (0, 0) — 16×16 window would extend to
    // (-8, -8). The boost must clip to [0, 7] without out-of-bounds writes.
    const img = makePatchedImage(0, 0);
    const out = applyFaceBoost(img, fakeLandmarks(0, 0), true);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
    // (0, 0) is inside the (clipped) window so it should reflect a boost
    // (or at least not be NaN). Pixels of 0..255 only.
    expect(Number.isFinite(out.data[0])).toBe(true);
    expect(out.data[0]).toBeGreaterThanOrEqual(0);
    expect(out.data[0]).toBeLessThanOrEqual(255);
  });

  it("landmark exactly at the bottom-right pixel clips cleanly", () => {
    const img = makePatchedImage(W - 1, H - 1);
    const out = applyFaceBoost(img, fakeLandmarks(W - 1, H - 1), true);
    expect(out.width).toBe(W);
    expect(out.height).toBe(H);
  });

  it("landmark mesh shorter than expected (no canonical index) is a no-op for missing indices", () => {
    // Single-element array — every canonical index lookup hits undefined
    // and the loop skips. Result is byte-equivalent to input (no boost
    // happened) but a fresh ImageData (we always allocate when firing).
    const img = makePatchedImage(32, 32);
    const out = applyFaceBoost(img, [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }], true);
    // Same pixel values everywhere.
    for (let i = 0; i < img.data.length; i++) {
      expect(out.data[i]).toBe(img.data[i]);
    }
  });
});
