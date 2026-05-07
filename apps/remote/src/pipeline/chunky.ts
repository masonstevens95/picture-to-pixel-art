/**
 * Chunky pixel render — final-pass NxN block multiplication.
 *
 * Each input pixel becomes an NxN block in the output. Output dims are
 * (width * chunkSize) x (height * chunkSize). The PNG carries the chunky
 * scaling at export time, which is the desired game-asset workflow output.
 *
 * chunkSize=1 short-circuits to identity — required for R12 invariant.
 */

export const MAX_CHUNK_SIZE = 4;

export function chunkify(image: ImageData, chunkSize: number): ImageData {
  if (chunkSize === 1) return image;
  if (!Number.isFinite(chunkSize) || chunkSize < 1) {
    throw new Error(`chunkSize must be a positive integer, got ${chunkSize}`);
  }
  const n = Math.min(MAX_CHUNK_SIZE, Math.floor(chunkSize));

  const srcW = image.width;
  const srcH = image.height;
  const dstW = srcW * n;
  const dstH = srcH * n;
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      const srcOffset = (sy * srcW + sx) * 4;
      const r = image.data[srcOffset]!;
      const g = image.data[srcOffset + 1]!;
      const b = image.data[srcOffset + 2]!;
      const a = image.data[srcOffset + 3]!;
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) {
          const dstOffset = ((sy * n + dy) * dstW + (sx * n + dx)) * 4;
          dst[dstOffset] = r;
          dst[dstOffset + 1] = g;
          dst[dstOffset + 2] = b;
          dst[dstOffset + 3] = a;
        }
      }
    }
  }

  return new ImageData(dst, dstW, dstH);
}
