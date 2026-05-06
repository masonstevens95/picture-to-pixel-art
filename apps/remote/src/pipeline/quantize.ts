import * as iq from "image-q";
import type { RGB } from "./palettes";

/**
 * Color quantization via image-q's Wu algorithm (Auto mode) OR application
 * of a fixed palette (Curated / Custom modes).
 *
 * Auto mode: build a Wu palette from the source and apply it.
 *   - When brand colors are present, Wu builds at size
 *     (paletteSize - brandColors.length) so its quality function isn't
 *     wasted on slots that would be evicted; brand colors then prepend.
 *   - When no brand colors, behaves exactly as v1.
 *
 * Fixed-palette mode (Curated / Custom): skip Wu, apply the supplied
 * RGB tuples via image-q's applyPaletteSync. Brand colors prepend to the
 * supplied palette; trailing entries are evicted if total exceeds the
 * palette size.
 */

const DEFAULT_PALETTE_SIZE = 16;

export interface QuantizeOptions {
  /**
   * If supplied, skips Wu palette-building and applies these colors
   * directly. Used by Curated and Custom palette modes.
   */
  fixedPalette?: readonly RGB[];
  /**
   * Brand colors that must appear in the output. They take priority over
   * Wu output (Auto) or trailing entries (Curated/Custom).
   */
  brandColors?: readonly RGB[];
  /**
   * Target palette size for Auto mode and the truncation cap for fixed
   * palettes when brand colors push total over the natural size.
   * Defaults to 16 (v1 baseline).
   */
  paletteSize?: number;
}

export function quantizePalette(input: ImageData, options: QuantizeOptions = {}): ImageData {
  const { fixedPalette, brandColors = [], paletteSize = DEFAULT_PALETTE_SIZE } = options;

  if (paletteSize < 2) {
    throw new Error(`paletteSize must be >= 2, got ${paletteSize}`);
  }

  const point = iq.utils.PointContainer.fromUint8Array(input.data, input.width, input.height);

  let palette: iq.utils.Palette;

  if (fixedPalette) {
    // Fixed palette path: build from supplied RGB tuples, optionally
    // augmented with brand colors at the front.
    const merged = mergeBrandColors(fixedPalette, brandColors, fixedPalette.length);
    palette = paletteFromRgbList(merged);
  } else if (brandColors.length > 0) {
    // Auto + brand: ask Wu for a smaller target so brand colors fit.
    const wuTarget = Math.max(2, paletteSize - brandColors.length);
    const wuPalette = iq.buildPaletteSync([point], {
      colors: wuTarget,
      paletteQuantization: "wuquant",
      colorDistanceFormula: "euclidean",
    });
    const wuColors: RGB[] = [];
    for (const p of wuPalette.getPointContainer().getPointArray()) {
      wuColors.push([p.r, p.g, p.b]);
    }
    const merged = mergeBrandColors(wuColors, brandColors, paletteSize);
    palette = paletteFromRgbList(merged);
  } else {
    // Pure Auto mode (v1 path): Wu over the source, no augmentation.
    palette = iq.buildPaletteSync([point], {
      colors: paletteSize,
      paletteQuantization: "wuquant",
      colorDistanceFormula: "euclidean",
    });
  }

  const quantized = iq.applyPaletteSync(point, palette, {
    colorDistanceFormula: "euclidean",
    imageQuantization: "nearest",
  });

  const u8 = quantized.toUint8Array();
  const out = new Uint8ClampedArray(u8);
  for (let i = 3; i < out.length; i += 4) {
    out[i] = 255;
  }
  return new ImageData(out, input.width, input.height);
}

function paletteFromRgbList(colors: readonly RGB[]): iq.utils.Palette {
  const palette = new iq.utils.Palette();
  for (const [r, g, b] of colors) {
    palette.add(iq.utils.Point.createByRGBA(r, g, b, 255));
  }
  return palette;
}

/**
 * Brand colors prepend to the base palette and dedup by exact RGB match.
 * If total exceeds maxSize, trailing base entries are evicted (or the
 * brand list itself is truncated when brand alone exceeds the cap).
 */
export function mergeBrandColors(
  base: readonly RGB[],
  brand: readonly RGB[],
  maxSize: number,
): RGB[] {
  if (brand.length === 0) return [...base].slice(0, maxSize);

  const seen = new Set<number>();
  const result: RGB[] = [];
  const key = ([r, g, b]: RGB) => (r << 16) | (g << 8) | b;

  for (const c of brand) {
    if (result.length >= maxSize) break;
    const k = key(c);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(c);
    }
  }

  for (const c of base) {
    if (result.length >= maxSize) break;
    const k = key(c);
    if (!seen.has(k)) {
      seen.add(k);
      result.push(c);
    }
  }

  return result;
}

/**
 * Returns the count of distinct (R,G,B) tuples in the input ImageData.
 * Useful for quantization tests.
 */
export function countDistinctColors(image: ImageData): number {
  const seen = new Set<number>();
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    seen.add(key);
  }
  return seen.size;
}
