/**
 * Per-channel band reduction (posterization).
 *
 * Quantizes each RGB channel to `bands` evenly-spaced output levels.
 * Distinct from palette quantization: posterization shapes the gradient
 * (how many distinct levels per channel exist), palette quantization picks
 * which RGB tuples survive after the channel-quantization. Posterization
 * runs before downscale so bands are visible in the source-resolution
 * image and survive area-averaging.
 *
 * Formula: per channel, `bin = floor(c * bands / 256)` produces bin 0..bands-1.
 * Output value = `round(bin * 255 / (bands - 1))` for evenly-spaced integers
 * across the full 0..255 range. bands=2 produces {0, 255}; bands=4 produces
 * {0, 85, 170, 255} ish (rounding may shift by 1).
 *
 * bands=undefined or bands<2 short-circuits to identity (R12 contribution).
 */

export function posterize(image: ImageData, bands: number | undefined): ImageData {
  if (bands === undefined || bands < 2) return image;
  if (!Number.isFinite(bands)) {
    throw new Error(`posterize bands must be finite, got ${bands}`);
  }

  const step = 255 / (bands - 1);
  const src = image.data;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = Math.round(Math.floor((src[i]! * bands) / 256) * step);
    dst[i + 1] = Math.round(Math.floor((src[i + 1]! * bands) / 256) * step);
    dst[i + 2] = Math.round(Math.floor((src[i + 2]! * bands) / 256) * step);
    dst[i + 3] = src[i + 3]!;
  }

  return new ImageData(dst, image.width, image.height);
}
