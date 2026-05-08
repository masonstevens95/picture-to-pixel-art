/**
 * Source-resolution alpha-mask morphology (v4.2).
 *
 * Two ops, both 4-neighbor binary morphology applied to the alpha channel
 * of a silhouette mask at SOURCE resolution (before downscale):
 *
 *   - close(radius)  → dilate then erode. Fills small holes inside the
 *     subject and fuses fragmented foreground regions; net size is
 *     approximately preserved. Useful when the U2-NetP mask has tiny
 *     holes the area-average downscale would otherwise leak through.
 *
 *   - dilate(radius) → pure dilation. Fattens thin features (mortar
 *     barrel, tripod legs, weapon handles) so they survive aggressive
 *     downscale and read as solid shapes in the cartoon output.
 *
 * Radius is denominated in source pixels. Both ops short-circuit to
 * identity (return input by reference) when radius ≤ 0, preserving the
 * v4.1 invariant: default-off contributes nothing to output.
 *
 * Image-edge handling: dilation can't extend beyond the image bounds,
 * and erosion treats outside-the-image as background. For close, this
 * means foreground pixels touching the image edge get eaten by the
 * erode pass — an acceptable cost; tight-crop runs after morphology
 * and re-frames the subject anyway.
 */

export function dilateMask(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  const w = mask.width;
  const h = mask.height;
  let current = new Uint8ClampedArray(mask.data);
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8ClampedArray(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (current[idx] === 255) continue;
        if (
          (x > 0 && current[idx - 4] === 255) ||
          (x < w - 1 && current[idx + 4] === 255) ||
          (y > 0 && current[idx - w * 4] === 255) ||
          (y < h - 1 && current[idx + w * 4] === 255)
        ) {
          next[idx] = 255;
        }
      }
    }
    current = next;
  }
  return new ImageData(current, w, h);
}

export function erodeMask(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  const w = mask.width;
  const h = mask.height;
  let current = new Uint8ClampedArray(mask.data);
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8ClampedArray(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3;
        if (current[idx] === 0) continue;
        // Outside-image counts as background, so edge pixels erode.
        if (
          x === 0 || current[idx - 4] === 0 ||
          x === w - 1 || current[idx + 4] === 0 ||
          y === 0 || current[idx - w * 4] === 0 ||
          y === h - 1 || current[idx + w * 4] === 0
        ) {
          next[idx] = 0;
        }
      }
    }
    current = next;
  }
  return new ImageData(current, w, h);
}

export function closeMask(mask: ImageData, radius: number): ImageData {
  if (radius <= 0) return mask;
  return erodeMask(dilateMask(mask, radius), radius);
}
