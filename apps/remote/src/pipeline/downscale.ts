/**
 * Area-average downscale, hand-rolled (no canvas).
 *
 * Why not canvas + imageSmoothingEnabled=true? The canvas approach requires
 * an OffscreenCanvas, which means we can't unit-test in jsdom — only in
 * Playwright. A pure-JS box filter is fast enough for v1 (input <=4000x3000,
 * output <=256x256 = millions of source reads, tens of ms) and is testable
 * in plain jsdom by passing ImageData fixtures.
 *
 * Why area-average instead of nearest-neighbor? True nearest-neighbor of a
 * photographic source produces aliased noise, not pixel art. The pixel-art
 * aesthetic comes from low resolution + limited palette (handled by quantize),
 * not the resampling kernel. Documented in the plan's Key Technical Decisions.
 *
 * Input is assumed to be fully opaque (alpha = 255) — the worker composites
 * the source ImageBitmap over a neutral background before calling this, so
 * partial alpha never reaches downscale.
 */

export interface DownscaleOptions {
  /**
   * When provided, foreground pixels (alpha=255 in mask) are weighted higher
   * than background pixels (alpha=0) in the area average. Mask must match
   * input dimensions. v4.1 "subject readability" pass: thin foreground
   * features (e.g. tripod legs at 128px output) survive area-averaging
   * instead of being washed out by surrounding background pixels.
   */
  mask?: ImageData;
  /**
   * Multiplier applied to foreground pixels when `mask` is provided. Default
   * 10 — empirically gives thin features high survival without distorting
   * solid regions where most pixels are foreground anyway.
   */
  subjectWeight?: number;
}

export function areaAverageDownscale(
  input: ImageData,
  targetWidth: number,
  targetHeight: number,
  options: DownscaleOptions = {},
): ImageData {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error(`Target dims must be positive, got ${targetWidth}x${targetHeight}`);
  }
  if (input.width <= 0 || input.height <= 0) {
    throw new Error(`Source dims must be positive, got ${input.width}x${input.height}`);
  }
  const mask = options.mask;
  if (mask && (mask.width !== input.width || mask.height !== input.height)) {
    throw new Error(
      `Mask dims (${mask.width}x${mask.height}) must match input (${input.width}x${input.height})`,
    );
  }
  const subjectWeight = options.subjectWeight ?? 10;

  // Don't upscale — return source as-is when target is at or above source.
  if (targetWidth >= input.width && targetHeight >= input.height) {
    // Defensive copy: callers should be free to mutate the result.
    const out = new Uint8ClampedArray(input.data);
    return new ImageData(out, input.width, input.height);
  }

  const srcW = input.width;
  const srcH = input.height;
  const dst = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  // For each destination pixel, average all source pixels covered by its
  // back-projected rectangle. Fractional coverage at the edges is handled by
  // weighting partial pixels by the fractional area they contribute. When a
  // mask is provided, each pixel's weight is also multiplied by subjectWeight
  // if it's a foreground pixel — biases the average toward subject preservation.
  const xRatio = srcW / targetWidth;
  const yRatio = srcH / targetHeight;

  for (let dy = 0; dy < targetHeight; dy++) {
    const sy0 = dy * yRatio;
    const sy1 = sy0 + yRatio;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(srcH, Math.ceil(sy1));

    for (let dx = 0; dx < targetWidth; dx++) {
      const sx0 = dx * xRatio;
      const sx1 = sx0 + xRatio;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(srcW, Math.ceil(sx1));

      let r = 0;
      let g = 0;
      let b = 0;
      let weightSum = 0;

      for (let sy = iy0; sy < iy1; sy++) {
        const yWeight = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (yWeight <= 0) continue;
        for (let sx = ix0; sx < ix1; sx++) {
          const xWeight = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (xWeight <= 0) continue;
          let w = xWeight * yWeight;
          if (mask) {
            // Foreground if mask alpha is 255; background if 0. Multiplying
            // by subjectWeight pulls the average toward foreground samples.
            const maskAlpha = mask.data[(sy * srcW + sx) * 4 + 3]!;
            if (maskAlpha > 127) {
              w *= subjectWeight;
            }
          }
          const offset = (sy * srcW + sx) * 4;
          r += input.data[offset]! * w;
          g += input.data[offset + 1]! * w;
          b += input.data[offset + 2]! * w;
          weightSum += w;
        }
      }

      const dOffset = (dy * targetWidth + dx) * 4;
      if (weightSum > 0) {
        dst[dOffset] = Math.round(r / weightSum);
        dst[dOffset + 1] = Math.round(g / weightSum);
        dst[dOffset + 2] = Math.round(b / weightSum);
      }
      dst[dOffset + 3] = 255;
    }
  }

  return new ImageData(dst, targetWidth, targetHeight);
}
