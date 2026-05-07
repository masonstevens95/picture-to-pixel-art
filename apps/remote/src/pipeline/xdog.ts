/**
 * Winnemöller XDoG (eXtended Difference of Gaussians) edge detection (U4).
 *
 * Pure function: takes a luminance buffer (Float32, 0..255) and returns a
 * binary edge mask (Uint8, 0 or 255 per pixel). Caller is responsible for
 * computing luminance from RGB and for any post-processing (dilation,
 * overlay) — `outline.ts` is the v4 caller.
 *
 * Why XDoG over Sobel:
 *   Sobel fires on every gradient — including skin texture, hair strands,
 *   noise — which is exactly the "halo around every detail" failure mode
 *   the v3 outline exhibits on photographs. XDoG's tanh-thresholded DoG
 *   suppresses low-contrast gradients (interior detail) while preserving
 *   high-contrast subject silhouettes. Same shape of output (binary mask
 *   for the outline pass to overlay), much cleaner cartoon look.
 *
 * Math (Winnemöller-style, adapted for binary edge masking):
 *   1. Two Gaussian blurs of luminance: B_σ and B_kσ.
 *   2. Centered DoG: D = (1 + τ) · B_σ − τ · B_kσ − B_σ = τ · (B_σ − B_kσ).
 *      Subtracting the "flat baseline" B_σ from Winnemöller's standard
 *      `(1+τ)·B_σ − τ·B_kσ` makes D = 0 in flat regions of *any* luminance,
 *      so dark flat areas (e.g. composited #171717 backgrounds) don't get
 *      spuriously marked as edges. At edges, B_σ ≠ B_kσ and D is non-zero.
 *   3. Tanh threshold on |D|: T = 0.5 · (1 + tanh(φ · (|D| − ε))).
 *   4. Binarize: T ≥ 0.5 → 255 (edge), else 0 (no edge). T crosses 0.5 at
 *      |D| = ε, so ε is the effective edge-magnitude threshold.
 *
 * Default parameters (Winnemöller 2012, "XDoG: An eXtended difference of
 * Gaussians compendium"): σ=0.4, k=1.6, τ=0.99, ε=0.1, φ=200. These produce
 * the "thick subject silhouette + thin interior detail" cartoon look. The
 * defaults are exposed via the optional params arg so future tuning is a
 * parameter change, not a code change.
 *
 * Implementation notes:
 *   - Gaussian blur is separable 1D (horizontal then vertical pass). Kernel
 *     size = `2 · ceil(3·σ) + 1`, clamped to a minimum of 3 so tiny inputs
 *     still get a well-defined 3×3 kernel.
 *   - Edge handling: clamp to image bounds (replicate-edge). Padding with
 *     zeros would bias edges toward dark and produce false outlines along
 *     the image perimeter.
 *   - Luminance and intermediate buffers are normalized to [0, 1] internally
 *     for the DoG/tanh math to keep ε and φ in their conventional ranges.
 */

export interface XDoGParams {
  readonly sigma: number;
  readonly k: number;
  readonly tau: number;
  readonly epsilon: number;
  readonly phi: number;
}

export const DEFAULT_XDOG_PARAMS: XDoGParams = {
  sigma: 0.4,
  k: 1.6,
  tau: 0.99,
  epsilon: 0.1,
  phi: 200,
};

export function xdog(
  luminance: Float32Array,
  width: number,
  height: number,
  params: XDoGParams = DEFAULT_XDOG_PARAMS,
): Uint8Array {
  const n = width * height;
  if (luminance.length !== n) {
    throw new Error(
      `xdog: luminance length ${luminance.length} does not match width*height ${n}`,
    );
  }
  const mask = new Uint8Array(n);
  if (n === 0) return mask;

  const { sigma, k, tau, epsilon, phi } = params;

  // Normalize luminance to [0, 1] for the DoG/tanh math.
  const norm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    norm[i] = luminance[i]! / 255;
  }

  const blurNarrow = gaussianBlurSeparable(norm, width, height, sigma);
  const blurWide = gaussianBlurSeparable(norm, width, height, k * sigma);

  for (let i = 0; i < n; i++) {
    // Centered DoG: D = τ · (B_σ − B_kσ). Equivalent to subtracting the
    // flat-region baseline B_σ from Winnemöller's `(1+τ)·B_σ − τ·B_kσ`.
    // Flat regions → D = 0; edges → D ≠ 0.
    const d = tau * (blurNarrow[i]! - blurWide[i]!);
    // T = 0.5 · (1 + tanh(φ · (|D| − ε))). T ≥ 0.5 ⇔ |D| ≥ ε ⇔ edge.
    const t = 0.5 * (1 + Math.tanh(phi * (Math.abs(d) - epsilon)));
    mask[i] = t >= 0.5 ? 255 : 0;
  }

  return mask;
}

/**
 * Separable 1D Gaussian blur with replicate-edge clamping.
 *
 * Builds a normalized 1D kernel of size `2·ceil(3·σ) + 1` (min 3), then
 * applies it horizontally into a scratch buffer, then vertically into the
 * output. Two O(N·k) passes instead of one O(N·k²) 2D convolution.
 */
function gaussianBlurSeparable(
  src: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  const kernel = buildGaussianKernel1D(sigma);
  const radius = (kernel.length - 1) >> 1;
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);

  // Horizontal pass: src → tmp.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let kx = -radius; kx <= radius; kx++) {
        const sx = clamp(x + kx, 0, width - 1);
        sum += src[row + sx]! * kernel[kx + radius]!;
      }
      tmp[row + x] = sum;
    }
  }

  // Vertical pass: tmp → dst.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const sy = clamp(y + ky, 0, height - 1);
        sum += tmp[sy * width + x]! * kernel[ky + radius]!;
      }
      dst[y * width + x] = sum;
    }
  }

  return dst;
}

function buildGaussianKernel1D(sigma: number): Float32Array {
  // Kernel size = 2·ceil(3·σ) + 1, with a minimum of 3 so tiny σ still
  // produces a well-defined 3-tap kernel.
  const halfWidth = Math.max(1, Math.ceil(3 * sigma));
  const size = 2 * halfWidth + 1;
  const kernel = new Float32Array(size);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - halfWidth;
    const w = Math.exp(-(x * x) / denom);
    kernel[i] = w;
    sum += w;
  }
  // Normalize to 1.0 — keeps the blur DC-preserving so a flat input stays
  // flat (otherwise we'd see a constant offset propagate into the DoG).
  for (let i = 0; i < size; i++) {
    kernel[i] = kernel[i]! / sum;
  }
  return kernel;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}
