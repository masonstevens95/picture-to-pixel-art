/**
 * Naive corner-sample silhouette / background-removal.
 *
 * Sampling happens AFTER the crop step in the worker pipeline (per the
 * v3 plan's post-crop fix). The four corner pixels of the cropped image
 * are averaged as the assumed background color; pixels within tolerance
 * become alpha=0; everything else stays alpha=255. Mask downscales
 * alongside the main image (nearest-neighbor preserves binary semantics)
 * and is applied at the end of pipeline.
 *
 * enabled=false in the worker short-circuits all silhouette steps; this
 * file's functions are pure and don't have a global short-circuit toggle
 * — the worker is the gatekeeper.
 */

import type { RGB } from "./palettes";

export const DEFAULT_SILHOUETTE_TOLERANCE = 12;
export const MAX_SILHOUETTE_TOLERANCE = 30;

/** Average the four corner pixels of an opaque ImageData → RGB. */
export function sampleBackgroundColor(image: ImageData): RGB {
  const w = image.width;
  const h = image.height;
  if (w < 1 || h < 1) return [0, 0, 0];

  const lastCol = (w - 1) * 4;
  const lastRow = (h - 1) * w * 4;
  const corners = [
    0, // top-left
    lastCol, // top-right
    lastRow, // bottom-left
    lastRow + lastCol, // bottom-right
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  for (const offset of corners) {
    r += image.data[offset]!;
    g += image.data[offset + 1]!;
    b += image.data[offset + 2]!;
  }
  return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
}

/**
 * Build a binary alpha mask: alpha=0 means "background" (within tolerance
 * of bgColor), alpha=255 means "foreground." RGB channels of the mask are
 * unused — only alpha is consumed downstream.
 */
export function buildMask(image: ImageData, bgColor: RGB, tolerance: number): ImageData {
  const [br, bg, bb] = bgColor;
  const tol2 = tolerance * tolerance;
  const w = image.width;
  const h = image.height;
  const dst = new Uint8ClampedArray(w * h * 4);

  for (let i = 0; i < image.data.length; i += 4) {
    const dr = image.data[i]! - br;
    const dg = image.data[i + 1]! - bg;
    const db = image.data[i + 2]! - bb;
    const dist2 = dr * dr + dg * dg + db * db;
    // Squared Euclidean RGB distance vs squared tolerance × 3 (per-channel
    // metric ~ tolerance per channel → distance² ≤ 3·tol²).
    dst[i + 3] = dist2 <= tol2 * 3 ? 0 : 255;
  }

  return new ImageData(dst, w, h);
}

/** Nearest-neighbor downscale of a binary mask to the target dims. */
export function downscaleMask(mask: ImageData, targetW: number, targetH: number): ImageData {
  if (targetW <= 0 || targetH <= 0) {
    throw new Error(`Target dims must be positive, got ${targetW}x${targetH}`);
  }
  if (targetW >= mask.width && targetH >= mask.height) {
    return mask;
  }

  const dst = new Uint8ClampedArray(targetW * targetH * 4);
  const srcW = mask.width;
  const srcH = mask.height;

  for (let dy = 0; dy < targetH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor((dy * srcH) / targetH));
    for (let dx = 0; dx < targetW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor((dx * srcW) / targetW));
      const srcOffset = (sy * srcW + sx) * 4;
      const dstOffset = (dy * targetW + dx) * 4;
      dst[dstOffset + 3] = mask.data[srcOffset + 3]!;
    }
  }

  return new ImageData(dst, targetW, targetH);
}

/**
 * Apply a binary mask to an opaque image: where the mask says background
 * (alpha=0), zero the alpha channel of the output. Foreground pixels keep
 * their original alpha (255 from upstream pipeline).
 */
export function applyMask(image: ImageData, mask: ImageData): ImageData {
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error(
      `applyMask dim mismatch: image ${image.width}x${image.height}, mask ${mask.width}x${mask.height}`,
    );
  }
  const dst = new Uint8ClampedArray(image.data);
  for (let i = 0; i < dst.length; i += 4) {
    if (mask.data[i + 3] === 0) {
      dst[i + 3] = 0;
    }
  }
  return new ImageData(dst, image.width, image.height);
}
