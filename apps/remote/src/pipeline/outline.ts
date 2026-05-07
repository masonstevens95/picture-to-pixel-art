/**
 * Sobel edge detection + line thickening + colored overlay.
 *
 * Runs at output resolution (post-downscale, pre-quantize) so 1-pixel-wide
 * outlines are crisp. Sobel computes per-pixel gradient magnitude on
 * luminance; threshold at SOBEL_THRESHOLD produces a binary edge mask.
 * Dilation expands the mask by `width − 1` 4-neighbor passes. Outline color
 * overlays the input where mask is true; quantization runs after so the
 * outline color participates in palette assignment.
 *
 * enabled=false short-circuits at the function level — returns the input
 * ImageData unchanged. Required for the v3 invariant (R12 / U7 test).
 *
 * Width = 1 → 1px outline (mask itself, no dilation passes).
 * Width = 2 → 2px outline (1 dilation pass).
 * Width = 3 → 3px outline (2 dilation passes).
 */

import type { RGB } from "./palettes";

const SOBEL_THRESHOLD = 50; // 0..255 magnitude cutoff. Tunable in code, not exposed.

export interface OutlineOptions {
  enabled: boolean;
  width: number; // 1..3
  color: RGB;
}

export function applyOutline(image: ImageData, options: OutlineOptions): ImageData {
  if (!options.enabled || options.width <= 0) return image;

  const { width: outlineWidth, color } = options;
  const w = image.width;
  const h = image.height;

  if (w < 3 || h < 3) {
    // Sobel needs 3x3 neighborhoods. Image too small → nothing to outline.
    return image;
  }

  // Step 1: compute Sobel edge mask on luminance.
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; p < image.data.length; p += 4, i++) {
    luma[i] =
      0.299 * image.data[p]! + 0.587 * image.data[p + 1]! + 0.114 * image.data[p + 2]!;
  }

  // Edge mask stored as Uint8Array (0 or 1) so dilation can read/write cheaply.
  let mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = luma[(y - 1) * w + (x - 1)]!;
      const tc = luma[(y - 1) * w + x]!;
      const tr = luma[(y - 1) * w + (x + 1)]!;
      const ml = luma[y * w + (x - 1)]!;
      const mr = luma[y * w + (x + 1)]!;
      const bl = luma[(y + 1) * w + (x - 1)]!;
      const bc = luma[(y + 1) * w + x]!;
      const br = luma[(y + 1) * w + (x + 1)]!;

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag >= SOBEL_THRESHOLD) mask[y * w + x] = 1;
    }
  }

  // Step 2: dilate the mask `outlineWidth − 1` times via 4-neighbor expansion.
  for (let pass = 1; pass < outlineWidth; pass++) {
    const next = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx]) {
          next[idx] = 1;
          if (x > 0) next[idx - 1] = 1;
          if (x < w - 1) next[idx + 1] = 1;
          if (y > 0) next[idx - w] = 1;
          if (y < h - 1) next[idx + w] = 1;
        }
      }
    }
    mask = next;
  }

  // Step 3: overlay outline color where mask is true.
  const dst = new Uint8ClampedArray(image.data);
  const [or, og, ob] = color;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i]) {
      dst[p] = or;
      dst[p + 1] = og;
      dst[p + 2] = ob;
      // Alpha untouched — preserves silhouette mask if it ran first.
    }
  }

  return new ImageData(dst, w, h);
}

export const DEFAULT_OUTLINE_COLOR: RGB = [0, 0, 0];
