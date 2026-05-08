/**
 * Silhouette boundary outline (v4.1).
 *
 * After the silhouette mask zeroes alpha on background pixels, foreground
 * subjects on a complex source can read as fragmented at low output
 * resolution — thin features become disconnected pixel groups that don't
 * obviously belong to the same shape. This stage strokes a 1–2 px outline
 * along every alpha-0/alpha-255 transition, "sealing" the silhouette into
 * a single readable graphic asset.
 *
 * Distinct from `outline.ts` (XDoG): that one detects edges in luminance
 * for cartoon line work. This one strokes the alpha boundary specifically,
 * which is what gives game-asset cutouts their characteristic chunky
 * outlined look.
 *
 * enabled=false short-circuits to identity (returns input by reference).
 * Identity-by-default is the v4-invariant contribution.
 */

export interface SilhouetteOutlineOptions {
  enabled: boolean;
  width: number; // 1 or 2
  color: readonly [number, number, number];
}

export function applySilhouetteOutline(
  image: ImageData,
  options: SilhouetteOutlineOptions,
): ImageData {
  if (!options.enabled || options.width <= 0) {
    return image;
  }

  const { width: w, height: h, data: src } = image;
  if (w < 2 || h < 2) {
    return image;
  }

  // Build the boundary mask: a pixel is on the boundary if its own alpha
  // differs from any 4-neighbor's alpha (one is 0, the other is 255). We
  // then dilate the mask by (width − 1) passes and overlay the configured
  // color at masked positions. Dilation matches the existing outline.ts
  // pattern so width semantics are consistent across the two outline types.
  let boundary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const a = src[idx * 4 + 3]!;
      // Only mark foreground pixels adjacent to background. A background
      // pixel on the boundary has alpha=0 and we don't paint it (would push
      // the outline outside the silhouette into the transparent region).
      if (a === 0) continue;
      let touchesBackground = false;
      // 4-neighbor check, with image-edge counting as background so subjects
      // that go to the image edge get a stroke there too.
      if (x === 0 || src[(y * w + (x - 1)) * 4 + 3]! === 0) touchesBackground = true;
      else if (x === w - 1 || src[(y * w + (x + 1)) * 4 + 3]! === 0) touchesBackground = true;
      else if (y === 0 || src[((y - 1) * w + x) * 4 + 3]! === 0) touchesBackground = true;
      else if (y === h - 1 || src[((y + 1) * w + x) * 4 + 3]! === 0) touchesBackground = true;
      if (touchesBackground) boundary[idx] = 1;
    }
  }

  // Dilate width-1 times into the foreground (4-neighbor expansion). This
  // thickens the stroke inward — never paints into transparent pixels.
  for (let pass = 1; pass < options.width; pass++) {
    const next = new Uint8Array(w * h);
    next.set(boundary);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (boundary[idx]) continue;
        // Only expand into foreground pixels (alpha > 0).
        if (src[idx * 4 + 3]! === 0) continue;
        if (
          (x > 0 && boundary[idx - 1]) ||
          (x < w - 1 && boundary[idx + 1]) ||
          (y > 0 && boundary[idx - w]) ||
          (y < h - 1 && boundary[idx + w])
        ) {
          next[idx] = 1;
        }
      }
    }
    boundary = next;
  }

  // Apply stroke color where boundary mask is set. Preserve alpha (stays 255
  // for foreground pixels).
  const out = new Uint8ClampedArray(src);
  const [r, g, b] = options.color;
  for (let i = 0; i < w * h; i++) {
    if (boundary[i]) {
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
    }
  }
  return new ImageData(out, w, h);
}
