import * as iq from "image-q";

/**
 * Color quantization via image-q's Wu algorithm.
 *
 * Why Wu? Fast (single pass, O(palette_size * pixels)), near-optimal
 * perceptual quality, and image-q's stock implementation is solid. Quantize
 * runs *after* downscale so the input is at most targetWidth x targetHeight
 * (<= 256x256 in v1), which keeps quantization in the millisecond range.
 *
 * Input is assumed fully opaque (alpha = 255 everywhere). The pipeline
 * composites the source over a neutral background before downscale + quantize,
 * so we never need to handle semi-transparent edges in the palette.
 */

const DEFAULT_PALETTE_SIZE = 16;

export function quantizePalette(
  input: ImageData,
  paletteSize: number = DEFAULT_PALETTE_SIZE,
): ImageData {
  if (paletteSize < 2) {
    throw new Error(`paletteSize must be >= 2, got ${paletteSize}`);
  }

  const point = iq.utils.PointContainer.fromUint8Array(input.data, input.width, input.height);

  const palette = iq.buildPaletteSync([point], {
    colors: paletteSize,
    paletteQuantization: "wuquant",
    colorDistanceFormula: "euclidean",
  });

  const quantized = iq.applyPaletteSync(point, palette, {
    colorDistanceFormula: "euclidean",
    imageQuantization: "nearest",
  });

  // image-q returns a PointContainer; pull pixels back as Uint8ClampedArray.
  const u8 = quantized.toUint8Array();
  const out = new Uint8ClampedArray(u8);
  // Re-assert opaque alpha — image-q preserves alpha; the pipeline contract
  // is fully-opaque output, so normalize once here as a safety net.
  for (let i = 3; i < out.length; i += 4) {
    out[i] = 255;
  }
  return new ImageData(out, input.width, input.height);
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
