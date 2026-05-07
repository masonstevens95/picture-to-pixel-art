/**
 * Landmark-aware contrast boost (U6).
 *
 * Pure function: given a MediaPipe NormalizedLandmark[] from U6's
 * `detectLandmarks` and an image, apply a localized contrast boost in
 * 16×16 px windows around each of six canonical face features. Outside
 * those windows pixels pass through unchanged.
 *
 * Why this stage:
 *   v3 portraits at the 192-px Portrait resolution lose eye / mouth /
 *   nose definition because area-averaging over the source's pre-feature
 *   pixels collapses local contrast. Pre-emphasizing those features at
 *   source resolution lets the detail survive the area-average step
 *   downstream.
 *
 * Why the windows are landmark-driven (not face-bbox-driven):
 *   A bounding-box approach (boost the whole face rect) would also boost
 *   skin and forehead, which we already smoothed with bilateral. The goal
 *   is the per-feature definition, not a global contrast pass.
 *
 * R12 / identity-by-default:
 *   `enabled === false` OR `landmarks === null` → return the input by
 *   reference. No allocation, byte-identical to v3 along the default
 *   pipeline. Aligned with the bilateral / saturation `off` patterns.
 *
 * Alpha: bypass — copied from input untouched. Boost only operates on RGB.
 */

import type { NormalizedLandmark } from "./sourceCache";

/**
 * Hard-coded landmark indices for the six features we boost. These are
 * canonical MediaPipe Face Mesh indices (478-point mesh). Shipping them
 * as constants keeps the worker independent of MediaPipe runtime checks.
 *
 * Outer eye corners pull two reliable points per eye (vs iris-center 468/473
 * which only exist with `refineLandmarks: true`). Mouth corners (61 / 291)
 * and lip-top center (13) cover the mouth shape; nose tip (1) anchors the
 * nose region. Six points total — matches the plan's per-feature window
 * count.
 */
const FEATURE_LANDMARK_INDICES: readonly number[] = [
  33, // left eye outer corner
  263, // right eye outer corner
  1, // nose tip
  13, // upper lip center
  61, // left mouth corner
  291, // right mouth corner
];

/** Half-width of each boost window in source pixels. Window is 16×16. */
const WINDOW_RADIUS = 8;

/** Contrast multiplier inside the window. +20% per the plan. */
const CONTRAST_GAIN = 1.2;

/**
 * Gaussian falloff sigma (pixels). Picked so weight at the window edge
 * (d = WINDOW_RADIUS = 8) is ~0.28: visible-but-fading rather than a
 * hard rectangular boost. exp(-(8²)/(2·5²)) ≈ 0.28.
 */
const FALLOFF_SIGMA = 5;

export function applyFaceBoost(
  image: ImageData,
  landmarks: NormalizedLandmark[] | null,
  enabled: boolean,
): ImageData {
  // R12 short-circuits. Either path returns the input by reference so
  // upstream callers can compare via `=== input` for the identity case.
  if (!enabled) return image;
  if (landmarks === null) return image;

  const w = image.width;
  const h = image.height;
  const src = image.data;
  // Defensive: degenerate dims short-circuit. The worker won't invoke us
  // here (it bails earlier), but the function is exported for unit tests.
  if (w <= 0 || h <= 0) return image;

  // Copy first; we mutate only inside the windows. Pixels outside any
  // window stay byte-identical to input.
  const dst = new Uint8ClampedArray(src);

  const denom = 2 * FALLOFF_SIGMA * FALLOFF_SIGMA;
  // Cache the falloff weights — same shape repeats per landmark.
  const side = WINDOW_RADIUS * 2 + 1;
  const falloff = new Float32Array(side * side);
  for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
    for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
      falloff[(dy + WINDOW_RADIUS) * side + (dx + WINDOW_RADIUS)] = Math.exp(
        -(dx * dx + dy * dy) / denom,
      );
    }
  }

  for (const idx of FEATURE_LANDMARK_INDICES) {
    const lm = landmarks[idx];
    if (!lm) continue; // landmark mesh shorter than expected — skip.

    // Landmarks are normalized [0, 1]; convert to pixel coords. Round to
    // nearest pixel — sub-pixel jitter would make the boost flicker on
    // micro-camera-shake which we already handle upstream via bilateral.
    const cx = Math.round(lm.x * w);
    const cy = Math.round(lm.y * h);

    // Clip the window to image bounds. Off-image landmarks (rare; happens
    // on extreme head turn) just paint a smaller rectangle.
    const x0 = Math.max(0, cx - WINDOW_RADIUS);
    const y0 = Math.max(0, cy - WINDOW_RADIUS);
    const x1 = Math.min(w - 1, cx + WINDOW_RADIUS);
    const y1 = Math.min(h - 1, cy + WINDOW_RADIUS);
    if (x0 > x1 || y0 > y1) continue; // entirely off-image → no-op.

    // Compute the local mean of the window from the SOURCE (not from `dst`).
    // Using src means overlapping windows from neighboring landmarks each
    // see the original pixels — boosts compose linearly rather than
    // re-amplifying an already-boosted region.
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const off = (yy * w + xx) * 4;
        sumR += src[off]!;
        sumG += src[off + 1]!;
        sumB += src[off + 2]!;
        count++;
      }
    }
    const meanR = sumR / count;
    const meanG = sumG / count;
    const meanB = sumB / count;

    // Apply boost with falloff. weight=1 at the center, ~0.28 at the
    // window edge. out = mix(input, boosted, weight).
    for (let yy = y0; yy <= y1; yy++) {
      const ky = yy - cy + WINDOW_RADIUS;
      for (let xx = x0; xx <= x1; xx++) {
        const kx = xx - cx + WINDOW_RADIUS;
        const wgt = falloff[ky * side + kx]!;
        const off = (yy * w + xx) * 4;

        const inR = src[off]!;
        const inG = src[off + 1]!;
        const inB = src[off + 2]!;

        // Linear contrast around the local mean. clamp via Uint8ClampedArray.
        const boostR = meanR + CONTRAST_GAIN * (inR - meanR);
        const boostG = meanG + CONTRAST_GAIN * (inG - meanG);
        const boostB = meanB + CONTRAST_GAIN * (inB - meanB);

        // Blend. dst already holds src values from the initial copy; we
        // overwrite only at the in-window cells, so the blend is between
        // the original and the boosted value — overlap regions sum the
        // contributions of the SECOND landmark to land last (idempotent
        // enough for the plan's "feature definition" goal; pixel-perfect
        // overlap commutativity isn't a v4 requirement).
        dst[off] = inR + (boostR - inR) * wgt;
        dst[off + 1] = inG + (boostG - inG) * wgt;
        dst[off + 2] = inB + (boostB - inB) * wgt;
        // Alpha pass-through — already copied, but be explicit for
        // readers who skim. Uint8ClampedArray ignores out-of-range writes.
        dst[off + 3] = src[off + 3]!;
      }
    }
  }

  return new ImageData(dst, w, h);
}
