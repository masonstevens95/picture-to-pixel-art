/**
 * Center-crop ImageData to a target width/height ratio.
 *
 * Returns the largest centered rectangle within the source whose
 * width/height equals targetRatio (W/H). When the source already matches
 * the ratio (within 1px tolerance), returns the input unchanged.
 *
 * No "smart" subject detection in v2 — center crop is predictable,
 * deterministic, and zero-dependency. Smart crop is a v3 follow-up if
 * users complain about portraits losing their subject.
 */

export function centerCrop(image: ImageData, targetRatio: number): ImageData {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    throw new Error(`centerCrop targetRatio must be > 0 and finite, got ${targetRatio}`);
  }

  const srcW = image.width;
  const srcH = image.height;
  const sourceRatio = srcW / srcH;

  // Already at the target ratio (within 1 source pixel) — no-op.
  if (Math.abs(sourceRatio - targetRatio) < 1 / Math.max(srcW, srcH)) {
    return image;
  }

  let cropW: number;
  let cropH: number;
  if (sourceRatio > targetRatio) {
    // Source is too wide → crop width.
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
  } else {
    // Source is too tall → crop height.
    cropW = srcW;
    cropH = Math.round(srcW / targetRatio);
  }

  cropW = Math.max(1, Math.min(cropW, srcW));
  cropH = Math.max(1, Math.min(cropH, srcH));

  const xOffset = Math.floor((srcW - cropW) / 2);
  const yOffset = Math.floor((srcH - cropH) / 2);

  const dst = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRowStart = ((y + yOffset) * srcW + xOffset) * 4;
    const dstRowStart = y * cropW * 4;
    for (let i = 0; i < cropW * 4; i++) {
      dst[dstRowStart + i] = image.data[srcRowStart + i]!;
    }
  }

  return new ImageData(dst, cropW, cropH);
}
