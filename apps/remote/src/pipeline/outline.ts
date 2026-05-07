/**
 * Outline overlay pipeline stage.
 *
 * v4 internals: Winnemöller XDoG edge detection (see `xdog.ts`) replaces v3's
 * Sobel gradient. The external API is unchanged: `applyOutline(image, options)`
 * takes the same `OutlineOptions` shape v3 exposed, returns an `ImageData`.
 *
 * Why XDoG over Sobel:
 *   Sobel fires on every gradient — including skin texture, hair strands,
 *   noise — producing the "halo around every detail" failure on photos.
 *   XDoG's tanh-thresholded difference-of-Gaussians suppresses low-contrast
 *   gradients (interior detail) while preserving high-contrast subject
 *   silhouettes. The dilation pass and color overlay are unchanged from v3.
 *
 * Pipeline position (v4): post-quantize, pre-silhouette-mask. The shift from
 * pre-quantize (v3) to post-quantize (v4) keeps the configured outline color
 * exact in the output — quantization can no longer absorb the outline color
 * into the nearest palette bucket.
 *
 * enabled=false short-circuits at the function level — returns the input
 * ImageData unchanged (same reference). Required for the v3 invariant
 * (R12 / U7 test) and the v4-default invariant.
 *
 * Width = 1 → 1px outline (XDoG mask itself, no dilation passes).
 * Width = 2 → 2px outline (1 dilation pass).
 * Width = 3 → 3px outline (2 dilation passes).
 *
 * Small-input safety: 1×1 and 2×2 images return the input unchanged. XDoG's
 * 3-tap kernel is technically defined on those sizes, but no edges are
 * possible at sub-3 dims and the explicit short-circuit keeps boundary
 * behavior crisp and documented.
 */

import type { RGB } from "./palettes";
import { xdog } from "./xdog";

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
    // Too small for meaningful edge detection — nothing to outline.
    return image;
  }

  // Step 1: compute luminance, then run XDoG → binary edge mask (0 or 255).
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; p < image.data.length; p += 4, i++) {
    luma[i] =
      0.299 * image.data[p]! + 0.587 * image.data[p + 1]! + 0.114 * image.data[p + 2]!;
  }
  const xdogMask = xdog(luma, w, h);

  // Convert XDoG's 0/255 mask into a compact 0/1 mask for the dilation
  // inner loop — branch on `mask[idx]` truthiness, same as v3.
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (xdogMask[i]) mask[i] = 1;
  }

  // Step 2: dilate the mask `outlineWidth − 1` times via 4-neighbor
  // expansion. Identical to v3 — only the edge-detection upstream changed.
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
