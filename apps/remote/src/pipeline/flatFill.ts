/**
 * Flat-fill posterize (v4.2): cel-shade the foreground.
 *
 * Even with a strong silhouette + cartoon outline, photographic input
 * tends to leave gradient/noise inside the subject — the mortar barrel
 * still carries continuous tone. Pixel-art "cartoony" look comes from
 * flat color regions, not gradients. This stage runs k-means in LAB
 * space on FOREGROUND pixels only (alpha > 0) and replaces each
 * foreground pixel with its cluster centroid.
 *
 * Why LAB (not RGB)? Perceptual distance is closer to human judgement
 * of "same-ish color." A black-vs-deep-green RGB cluster is less
 * intrusive than a deep-green-vs-light-green cluster perceptually,
 * even though their RGB distance may be similar.
 *
 * Why k-means and not just quantize? quantize already runs upstream
 * with paletteSize≈16. Flat-fill operates on the OUTPUT of quantize so
 * it sees at most 16 unique colors and converges in 2–3 iterations on
 * the ≤16 distinct LAB points; output uses k centroids. Background
 * pixels (alpha=0) are left untouched.
 *
 * `enabled=false` short-circuits to identity (returns input by
 * reference) — the v4.1 invariant.
 */

export interface FlatFillOptions {
  enabled: boolean;
  /** Number of flat colors in the output foreground. 2..16. */
  colors: number;
}

const MAX_ITERATIONS = 12;
const CONVERGE_EPS = 0.5;

export function applyFlatFill(image: ImageData, options: FlatFillOptions): ImageData {
  if (!options.enabled || options.colors <= 1) return image;
  const k = Math.max(2, Math.min(16, Math.round(options.colors)));

  // Collect unique foreground colors (small set after quantize → fast).
  const seenKeys = new Set<number>();
  const fgRgb: Array<[number, number, number]> = [];
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = (r << 16) | (g << 8) | b;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      fgRgb.push([r, g, b]);
    }
  }
  if (fgRgb.length === 0) return image;
  if (fgRgb.length <= k) {
    // Already fewer unique colors than the target — nothing to flatten.
    return image;
  }

  const fgLab = fgRgb.map(([r, g, b]) => rgbToLab(r, g, b));

  // K-means++ init: first center random, then each next center weighted
  // by squared distance to the nearest existing center. Picks well-spread
  // initial centroids and avoids the local-minima trap of random init.
  const centroids: Array<[number, number, number]> = [];
  centroids.push([...fgLab[0]!] as [number, number, number]);
  for (let c = 1; c < k; c++) {
    const dists = fgLab.map((p) => {
      let min = Infinity;
      for (const cc of centroids) {
        const d = labDistSq(p, cc);
        if (d < min) min = d;
      }
      return min;
    });
    let pick = 0;
    let best = -1;
    for (let i = 0; i < dists.length; i++) {
      if (dists[i]! > best) {
        best = dists[i]!;
        pick = i;
      }
    }
    centroids.push([...fgLab[pick]!] as [number, number, number]);
  }

  // Lloyd's iterations on the unique-color set.
  const assignments = new Array<number>(fgLab.length).fill(0);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    for (let i = 0; i < fgLab.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = labDistSq(fgLab[i]!, centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    const sums: Array<[number, number, number, number]> = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < fgLab.length; i++) {
      const a = assignments[i]!;
      const p = fgLab[i]!;
      const s = sums[a]!;
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3] += 1;
    }
    let maxShift = 0;
    for (let c = 0; c < centroids.length; c++) {
      const s = sums[c]!;
      if (s[3] === 0) continue;
      const nx = s[0] / s[3];
      const ny = s[1] / s[3];
      const nz = s[2] / s[3];
      const old = centroids[c]!;
      const shift = Math.sqrt(
        (nx - old[0]) ** 2 + (ny - old[1]) ** 2 + (nz - old[2]) ** 2,
      );
      if (shift > maxShift) maxShift = shift;
      centroids[c] = [nx, ny, nz];
    }
    if (maxShift < CONVERGE_EPS) break;
  }

  // Map each unique foreground color → its cluster centroid in RGB.
  const colorMap = new Map<number, [number, number, number]>();
  for (let i = 0; i < fgRgb.length; i++) {
    const [r, g, b] = fgRgb[i]!;
    const key = (r << 16) | (g << 8) | b;
    const c = centroids[assignments[i]!]!;
    colorMap.set(key, labToRgb(c[0], c[1], c[2]));
  }

  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! === 0) continue;
    const key = (out[i]! << 16) | (out[i + 1]! << 8) | out[i + 2]!;
    const mapped = colorMap.get(key);
    if (!mapped) continue;
    out[i] = mapped[0];
    out[i + 1] = mapped[1];
    out[i + 2] = mapped[2];
  }
  return new ImageData(out, image.width, image.height);
}

// sRGB ↔ LAB. Reference whites: D65. Standard formulas.

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  // sRGB → XYZ (D65)
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
  const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;
  // XYZ → LAB (D65 reference white)
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.0);
  const fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const x = 0.95047 * labFInv(fx);
  const y = 1.0 * labFInv(fy);
  const z = 1.08883 * labFInv(fz);
  // XYZ → linear sRGB
  const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const lg = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [
    Math.max(0, Math.min(255, Math.round(linearToSrgb(lr) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(lg) * 255))),
    Math.max(0, Math.min(255, Math.round(linearToSrgb(lb) * 255))),
  ];
}

function labDistSq(a: [number, number, number], b: [number, number, number]): number {
  const d0 = a[0] - b[0];
  const d1 = a[1] - b[1];
  const d2 = a[2] - b[2];
  return d0 * d0 + d1 * d1 + d2 * d2;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const LAB_DELTA = 6 / 29;
const LAB_DELTA_CUBE = LAB_DELTA ** 3;

function labF(t: number): number {
  return t > LAB_DELTA_CUBE ? Math.cbrt(t) : t / (3 * LAB_DELTA * LAB_DELTA) + 4 / 29;
}

function labFInv(t: number): number {
  return t > LAB_DELTA ? t ** 3 : 3 * LAB_DELTA * LAB_DELTA * (t - 4 / 29);
}
