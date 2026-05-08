/**
 * Source-resolution alpha-mask morphology (v4.2).
 *
 * Three ops applied at SOURCE resolution, before downscale:
 *
 *   - closeMask(radius)  → dilate then erode (alpha-only). Fills small
 *     holes inside the subject and fuses fragmented foreground regions;
 *     net size is approximately preserved. Useful when the U2-NetP mask
 *     has tiny holes that area-average downscale would otherwise leak
 *     through.
 *
 *   - dilateSubject(image, mask, radius) → WATERSHED dilation that
 *     fattens both the alpha mask and the subject's RGB outward, but
 *     stops at gap centerlines so adjacent thin features (e.g. tripod
 *     legs) don't merge into a single mass. The subject grows by R
 *     source pixels everywhere it has bg space; in narrow channels
 *     between fg regions the growth halts at the medial axis, leaving
 *     a 1-px bg ridge. Implementation: Chebyshev distance transform
 *     from fg, then for each bg pixel within R: if it's a strict local
 *     max on the distance map (= medial axis ridge), keep bg; else
 *     mark fg with RGB copied from the nearest fg seed.
 *
 *   - erodeMask(radius) → pure erosion (alpha-only). Treats outside the
 *     image as background, so edge pixels erode. Used internally by
 *     closeMask; not currently exposed on the worker dispatch path.
 *
 * Radius is denominated in source pixels. All ops short-circuit to
 * identity when radius ≤ 0, preserving the v4.1 invariant.
 */

export interface DilateSubjectResult {
  image: ImageData;
  mask: ImageData;
}

/**
 * Boundary-leak guard: U2-Net masks routinely classify ~1-3 source
 * pixels of background as foreground along the subject edge, because
 * the binary cutoff lands on anti-aliased transition pixels. If we
 * spread RGB starting from those pixels we propagate bg colors outward
 * (white halo around an olive subject on a white bg).
 *
 * Mitigation: pre-erode the mask by `BOUNDARY_CLEANUP` source pixels
 * to peel off the leaky boundary, then watershed-dilate by `radius +
 * BOUNDARY_CLEANUP` so the net outward growth still equals `radius`.
 * Cleanup is clamped to `radius` so dilate=1 doesn't accidentally
 * shrink the mask.
 */
const BOUNDARY_CLEANUP = 2;

interface DistanceTransform {
  /** Chebyshev distance from each pixel to the nearest fg pixel. 0 for fg. */
  dist: Int32Array;
  /** Index (y*w + x) of the nearest fg pixel for each pixel. */
  nearest: Int32Array;
}

/**
 * Two-pass chamfer Chebyshev distance transform.
 *
 * Each step (4-cardinal or diagonal) costs 1, so the resulting
 * distance is L∞ (Chebyshev). Approximate but adequate for our
 * dilation use case — exact Euclidean distance isn't needed because
 * the radius is small and the distance is only used for ordering /
 * thresholding, not metric measurement.
 *
 * Forward pass (top-left → bottom-right) propagates from already-
 * visited NW/N/NE/W neighbors; backward pass (bottom-right → top-
 * left) propagates from SE/S/SW/E. After both passes, dist[i] is
 * the Chebyshev distance from pixel i to its nearest fg pixel.
 */
function chebyshevDistanceTransform(mask: ImageData): DistanceTransform {
  const w = mask.width;
  const h = mask.height;
  const n = w * h;
  const INF = w + h + 100;
  const dist = new Int32Array(n);
  const nearest = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    if (mask.data[i * 4 + 3] === 255) {
      dist[i] = 0;
      nearest[i] = i;
    } else {
      dist[i] = INF;
    }
  }

  // Forward pass: NW, N, NE, W neighbors.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      let best = dist[idx]!;
      let bestSrc = nearest[idx]!;
      if (x > 0 && y > 0) {
        const d = dist[idx - w - 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx - w - 1]!; }
      }
      if (y > 0) {
        const d = dist[idx - w]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx - w]!; }
      }
      if (x < w - 1 && y > 0) {
        const d = dist[idx - w + 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx - w + 1]!; }
      }
      if (x > 0) {
        const d = dist[idx - 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx - 1]!; }
      }
      dist[idx] = best;
      nearest[idx] = bestSrc;
    }
  }

  // Backward pass: SE, S, SW, E neighbors.
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const idx = y * w + x;
      let best = dist[idx]!;
      let bestSrc = nearest[idx]!;
      if (x < w - 1 && y < h - 1) {
        const d = dist[idx + w + 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx + w + 1]!; }
      }
      if (y < h - 1) {
        const d = dist[idx + w]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx + w]!; }
      }
      if (x > 0 && y < h - 1) {
        const d = dist[idx + w - 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx + w - 1]!; }
      }
      if (x < w - 1) {
        const d = dist[idx + 1]! + 1;
        if (d < best) { best = d; bestSrc = nearest[idx + 1]!; }
      }
      dist[idx] = best;
      nearest[idx] = bestSrc;
    }
  }

  return { dist, nearest };
}

export function dilateSubject(
  image: ImageData,
  mask: ImageData,
  radius: number,
): DilateSubjectResult {
  if (radius <= 0) return { image, mask };
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error(
      `dilateSubject dim mismatch: image ${image.width}x${image.height}, mask ${mask.width}x${mask.height}`,
    );
  }
  const w = mask.width;
  const h = mask.height;

  const cleanupR = Math.min(BOUNDARY_CLEANUP, radius);
  const inputMask = cleanupR > 0 ? erodeMask(mask, cleanupR) : mask;
  const totalRadius = radius + cleanupR;

  const { dist, nearest } = chebyshevDistanceTransform(inputMask);

  const outMaskData = new Uint8ClampedArray(inputMask.data);
  const outImgData = new Uint8ClampedArray(image.data);
  const srcImgData = image.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const d = dist[idx]!;
      if (d === 0) continue; // already fg
      if (d > totalRadius) continue; // beyond growth limit

      // Watershed: this bg pixel is on a medial-axis ridge between two
      // fg regions if NO 8-neighbor has a strictly greater distance.
      // Flat ridges (neighbors at equal distance) also qualify — both
      // sides preserve the gap.
      let isRidge = true;
      for (let dy = -1; dy <= 1 && isRidge; dy++) {
        for (let dx = -1; dx <= 1 && isRidge; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (dist[ny * w + nx]! > d) isRidge = false;
        }
      }
      if (isRidge) continue;

      // Mark fg in mask, copy RGB from the nearest fg seed.
      outMaskData[idx * 4 + 3] = 255;
      const seed = nearest[idx]!;
      outImgData[idx * 4] = srcImgData[seed * 4]!;
      outImgData[idx * 4 + 1] = srcImgData[seed * 4 + 1]!;
      outImgData[idx * 4 + 2] = srcImgData[seed * 4 + 2]!;
    }
  }

  return {
    image: new ImageData(outImgData, w, h),
    mask: new ImageData(outMaskData, w, h),
  };
}

/**
 * Pure alpha-mask dilation (no RGB spread, no watershed). Used by
 * closeMask only — close erodes back, so RGB spread and watershed
 * preservation would both be wasted work.
 */
function dilateMaskOnly(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  const w = mask.width;
  const h = mask.height;
  let current = new Uint8ClampedArray(mask.data);
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8ClampedArray(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (current[idx] === 255) continue;
        if (
          (x > 0 && current[idx - 4] === 255) ||
          (x < w - 1 && current[idx + 4] === 255) ||
          (y > 0 && current[idx - w * 4] === 255) ||
          (y < h - 1 && current[idx + w * 4] === 255)
        ) {
          next[idx] = 255;
        }
      }
    }
    current = next;
  }
  return new ImageData(current, w, h);
}

export function erodeMask(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  const w = mask.width;
  const h = mask.height;
  let current = new Uint8ClampedArray(mask.data);
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8ClampedArray(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (current[idx] === 0) continue;
        // Outside-image counts as background, so edge pixels erode.
        if (
          x === 0 || current[idx - 4] === 0 ||
          x === w - 1 || current[idx + 4] === 0 ||
          y === 0 || current[idx - w * 4] === 0 ||
          y === h - 1 || current[idx + w * 4] === 0
        ) {
          next[idx] = 0;
        }
      }
    }
    current = next;
  }
  return new ImageData(current, w, h);
}

export function closeMask(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  return erodeMask(dilateMaskOnly(mask, radius), radius);
}
