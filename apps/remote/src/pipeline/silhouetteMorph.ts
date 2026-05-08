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
 *     stops where two distant fg seeds meet so adjacent thin features
 *     (e.g. tripod legs) don't merge into a single mass. The subject
 *     grows by R source pixels into open bg; in narrow channels
 *     between fg regions the growth halts at the watershed boundary,
 *     leaving a ~1-px bg ridge. Implementation: Chebyshev distance
 *     transform with nearest-fg-seed propagation. For each bg pixel
 *     within R distance: if any 8-neighbor's seed is FAR from this
 *     pixel's seed on the source plane (Chebyshev > SEED_GAP_THRESHOLD),
 *     keep bg; otherwise mark fg with RGB copied from the nearest fg
 *     seed. The seed-distance criterion (vs naive local-max-on-
 *     distance-map) avoids spurious holes inside fg concavities, where
 *     neighboring seeds vary smoothly along the SAME fg arc.
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

/**
 * Seed-distance threshold for watershed detection. Two adjacent bg
 * pixels with nearest-fg seeds farther apart than this threshold
 * (Chebyshev) are deemed to be on opposite sides of a watershed —
 * preserving the gap between distinct fg features. Seeds closer than
 * the threshold are treated as smooth variations along a single fg
 * arc (concavity), and the bg between them gets dilated normally.
 *
 * 4 source pixels: large enough to ignore U2-Net mask jitter
 * (1-2 px noise along the boundary) but small enough that genuine
 * gaps between thin features (tripod legs, weapon handles) trigger
 * the watershed.
 */
const SEED_GAP_THRESHOLD = 4;
const SEED_GAP_THRESHOLD_SQ = SEED_GAP_THRESHOLD * SEED_GAP_THRESHOLD;

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

      // Watershed: this bg pixel is on a watershed line if any
      // 8-neighbor's nearest-fg seed is FAR from this pixel's seed on
      // the source plane. Far seeds = opposite sides of a real gap
      // between fg features (tripod legs). Near seeds = smooth
      // variation along a single fg arc (concavity inside the subject)
      // — those should fill normally.
      const mySeed = nearest[idx]!;
      const mySeedX = mySeed % w;
      const mySeedY = (mySeed - mySeedX) / w;
      let isWatershed = false;
      for (let dy = -1; dy <= 1 && !isWatershed; dy++) {
        for (let dx = -1; dx <= 1 && !isWatershed; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nbrSeed = nearest[ny * w + nx]!;
          if (nbrSeed === mySeed) continue;
          const nbrSeedX = nbrSeed % w;
          const nbrSeedY = (nbrSeed - nbrSeedX) / w;
          const ddx = mySeedX - nbrSeedX;
          const ddy = mySeedY - nbrSeedY;
          if (ddx * ddx + ddy * ddy > SEED_GAP_THRESHOLD_SQ) {
            isWatershed = true;
          }
        }
      }
      if (isWatershed) continue;

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
