/**
 * Bilateral smoothing pipeline stage (U3).
 *
 * Naive Tomasi-Manduchi bilateral filter: a per-pixel weighted average over
 * a square spatial window, where each neighbor's weight is the product of a
 * spatial Gaussian (distance from the center pixel) and a range Gaussian
 * (intensity difference from the center pixel). The range term is what
 * distinguishes bilateral from a plain Gaussian blur — it kills edge
 * crossings, so flat regions smooth toward their mean while edges stay
 * sharp. This is the cartoon-look pass: "skin/background flatten, eyes/
 * mouth-line stay crisp".
 *
 * Why naive O(N·r²) and not separable / fast bilateral:
 *   The window radii here cap at 6 (smoothness=high → 13×13). On a typical
 *   1024×768 source that's ~150-200ms per pass on an M-class laptop, well
 *   inside the source-cached stage budget (the cache means it runs once
 *   per source-id, not per dispatch). The fast bilateral approximations
 *   (Paris-Durand, recursive bilateral, etc.) would shave milliseconds at
 *   the cost of much more code; not worth it for a portfolio tool.
 *
 * Why the 'off' short-circuit returns the input ImageData unchanged (same
 * reference): R12 invariant. With smoothness='off' the v4-default pipeline
 * must produce byte-identical output to v3's pipeline. Returning the input
 * directly (no allocation, no per-pixel work) is what makes that testable
 * via reference equality.
 *
 * Edge handling: clamp window indices to image bounds. Padding with zeros
 * would bias edge pixels toward black, which is visible at high smoothness.
 *
 * Alpha: bypass — copy through from input. Bilateral on alpha makes no
 * sense for opaque source-stage data, and the worker's silhouette mask is
 * the proper place to alter alpha downstream.
 */

export type SmoothnessLevel = "off" | "low" | "medium" | "high";

interface SmoothnessParams {
  /** Window half-width. The window is (2·radius + 1) on each side. */
  readonly radius: number;
  /** Spatial Gaussian sigma (pixels). */
  readonly spatialSigma: number;
  /** Range Gaussian sigma (intensity units, 0..255). */
  readonly rangeSigma: number;
}

/**
 * Smoothness-level → (spatial sigma, range sigma, window radius) lookup.
 *
 * - low    → σ_s=1.0, σ_r=25, radius=2 (5×5 window).  Light pore/noise pass.
 * - medium → σ_s=2.0, σ_r=35, radius=4 (9×9 window).  Default cartoon-skin pass.
 * - high   → σ_s=3.0, σ_r=50, radius=6 (13×13 window). Strongest flatten.
 *
 * Radius is `ceil(2·σ_spatial)` — covers ~95% of the spatial Gaussian's mass,
 * so widening it further wouldn't visibly change results. Fixed-per-level
 * keeps the inner loop bounds constant for the JIT.
 */
const PARAMS: Readonly<Record<Exclude<SmoothnessLevel, "off">, SmoothnessParams>> = {
  low: { radius: 2, spatialSigma: 1.0, rangeSigma: 25 },
  medium: { radius: 4, spatialSigma: 2.0, rangeSigma: 35 },
  high: { radius: 6, spatialSigma: 3.0, rangeSigma: 50 },
};

export function bilateralFilter(image: ImageData, smoothness: SmoothnessLevel): ImageData {
  // R12 short-circuit: 'off' returns the input ImageData by reference. No
  // allocation, byte-identical to v3 — same shape as saturationAdjust(0).
  if (smoothness === "off") return image;

  const params = PARAMS[smoothness];
  const { width: w, height: h } = image;
  const src = image.data;
  const dst = new Uint8ClampedArray(src.length);

  // Precompute the spatial-kernel weight table, indexed by window cell.
  // The kernel only depends on (dx, dy), so building a flat (2r+1)² array
  // keeps the inner loop branch-free.
  const r = params.radius;
  const side = 2 * r + 1;
  const spatialKernel = new Float64Array(side * side);
  const spatialDenom = 2 * params.spatialSigma * params.spatialSigma;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      spatialKernel[(dy + r) * side + (dx + r)] = Math.exp(-d2 / spatialDenom);
    }
  }

  const rangeDenom = 2 * params.rangeSigma * params.rangeSigma;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y * w + x) * 4;
      const cR = src[ci]!;
      const cG = src[ci + 1]!;
      const cB = src[ci + 2]!;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let wSumR = 0;
      let wSumG = 0;
      let wSumB = 0;

      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);

      for (let yy = y0; yy <= y1; yy++) {
        const ky = yy - y + r;
        for (let xx = x0; xx <= x1; xx++) {
          const kx = xx - x + r;
          const ws = spatialKernel[ky * side + kx]!;

          const ni = (yy * w + xx) * 4;
          const nR = src[ni]!;
          const nG = src[ni + 1]!;
          const nB = src[ni + 2]!;

          // Per-channel range Gaussians. Per-channel (vs single luminance
          // diff) is simpler and visibly indistinguishable for the cartoon
          // pass — color edges and luminance edges almost always coincide
          // on natural photos.
          const dR = nR - cR;
          const dG = nG - cG;
          const dB = nB - cB;
          const wrR = Math.exp(-(dR * dR) / rangeDenom);
          const wrG = Math.exp(-(dG * dG) / rangeDenom);
          const wrB = Math.exp(-(dB * dB) / rangeDenom);

          const wR = ws * wrR;
          const wG = ws * wrG;
          const wB = ws * wrB;

          sumR += nR * wR;
          sumG += nG * wG;
          sumB += nB * wB;
          wSumR += wR;
          wSumG += wG;
          wSumB += wB;
        }
      }

      // wSum is always > 0 because the center pixel itself is in the window
      // with weight 1 · 1 = 1, but Math.round handles the divide cleanly.
      dst[ci] = Math.round(sumR / wSumR);
      dst[ci + 1] = Math.round(sumG / wSumG);
      dst[ci + 2] = Math.round(sumB / wSumB);
      dst[ci + 3] = src[ci + 3]!; // alpha bypass
    }
  }

  return new ImageData(dst, w, h);
}
