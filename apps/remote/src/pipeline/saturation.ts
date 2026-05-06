/**
 * HSL saturation adjustment on RGB ImageData.
 *
 * Picks HSL over OkLCH for v2: simple math, no extra dep, "good enough"
 * for a portfolio-piece tool. Perceptual upgrade is a v3 follow-up if
 * quality complaints emerge.
 *
 * The function explicitly short-circuits at amount === 0 and returns the
 * input ImageData unchanged. RGB→HSL→RGB roundtrips on already-rounded
 * 8-bit values are otherwise lossy by ~1 unit per channel, so the
 * "saturation=0 is identity" invariant requires this guard to be testable
 * via byte-equality. The worker also short-circuits before calling, but
 * the function-level guard is what makes the unit test reachable.
 */

export function saturationAdjust(image: ImageData, amount: number): ImageData {
  if (amount === 0) return image;
  if (!Number.isFinite(amount)) {
    throw new Error(`saturationAdjust amount must be finite, got ${amount}`);
  }

  const factor = 1 + amount; // amount in [-1, +1] → factor in [0, 2]
  const src = image.data;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]! / 255;
    const g = src[i + 1]! / 255;
    const b = src[i + 2]! / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;

    let h = 0;
    let s = 0;

    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / delta + 2) / 6;
      else h = ((r - g) / delta + 4) / 6;
    }

    s = Math.max(0, Math.min(1, s * factor));

    let outR: number;
    let outG: number;
    let outB: number;
    if (s === 0) {
      outR = outG = outB = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      outR = hueToRgb(p, q, h + 1 / 3);
      outG = hueToRgb(p, q, h);
      outB = hueToRgb(p, q, h - 1 / 3);
    }

    dst[i] = Math.round(outR * 255);
    dst[i + 1] = Math.round(outG * 255);
    dst[i + 2] = Math.round(outB * 255);
    dst[i + 3] = src[i + 3]!;
  }

  return new ImageData(dst, image.width, image.height);
}

function hueToRgb(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}
