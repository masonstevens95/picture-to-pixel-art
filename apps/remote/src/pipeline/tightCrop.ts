/**
 * Tight crop (v4.2): re-frame the image to the foreground bounding box
 * before downscale so the subject fills more of the output canvas.
 *
 * The current pipeline accepts whatever framing the source photo has —
 * a mortar that occupies 60% of a 600×600 photo gets ~77 of 128 output
 * pixels along its long axis, and thin features compress into 1-pixel
 * strokes. Tight crop computes the foreground bbox from the silhouette
 * mask, expands it by a margin, and crops both image and mask to that
 * region. Downstream area-average downscale then sees a subject that
 * fills the frame, recovering proportional output detail.
 *
 * Three modes via `squarePad`:
 *   - false (default)  → output uses bbox aspect (subject-aspect output)
 *   - true             → square the bbox before crop, transparent fill
 *                         on the short axis. Mask alpha=0 in padded zone.
 *
 * `enabled=false` short-circuits to identity (returns inputs by
 * reference) — the v4.1 invariant.
 */

export interface TightCropOptions {
  enabled: boolean;
  /** 0..1: fraction of bbox max-dim to add as padding on every side. */
  margin: number;
  /** When true, pad the cropped region to square (transparent fill). */
  squarePad: boolean;
}

export interface TightCropResult {
  image: ImageData;
  mask: ImageData;
}

/** Compute foreground bbox from mask alpha; returns null if empty. */
export function computeForegroundBBox(
  mask: ImageData,
): { x: number; y: number; w: number; h: number } | null {
  const w = mask.width;
  const h = mask.height;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask.data[(y * w + x) * 4 + 3]! > 127) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function applyTightCrop(
  image: ImageData,
  mask: ImageData,
  options: TightCropOptions,
): TightCropResult {
  if (!options.enabled) return { image, mask };
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error(
      `tightCrop dim mismatch: image ${image.width}x${image.height}, mask ${mask.width}x${mask.height}`,
    );
  }
  const bbox = computeForegroundBBox(mask);
  if (!bbox) return { image, mask };

  const margin = Math.max(0, Math.min(1, options.margin));
  const pad = Math.round(Math.max(bbox.w, bbox.h) * margin);
  let x0 = Math.max(0, bbox.x - pad);
  let y0 = Math.max(0, bbox.y - pad);
  let x1 = Math.min(image.width, bbox.x + bbox.w + pad);
  let y1 = Math.min(image.height, bbox.y + bbox.h + pad);

  if (options.squarePad) {
    // Expand the smaller axis around its center to match the larger axis,
    // clamping to image bounds. If clamping prevents a true square, the
    // padded zone fills with transparent background.
    const cw = x1 - x0;
    const ch = y1 - y0;
    if (cw > ch) {
      const need = cw - ch;
      const top = Math.floor(need / 2);
      const bot = need - top;
      y0 = Math.max(0, y0 - top);
      y1 = Math.min(image.height, y1 + bot);
    } else if (ch > cw) {
      const need = ch - cw;
      const left = Math.floor(need / 2);
      const right = need - left;
      x0 = Math.max(0, x0 - left);
      x1 = Math.min(image.width, x1 + right);
    }
  }

  const cropW = x1 - x0;
  const cropH = y1 - y0;
  if (cropW <= 0 || cropH <= 0) return { image, mask };
  if (cropW === image.width && cropH === image.height) {
    return { image, mask };
  }

  const dstImg = new Uint8ClampedArray(cropW * cropH * 4);
  const dstMask = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcY = y + y0;
    for (let x = 0; x < cropW; x++) {
      const srcX = x + x0;
      const srcOff = (srcY * image.width + srcX) * 4;
      const dstOff = (y * cropW + x) * 4;
      dstImg[dstOff] = image.data[srcOff]!;
      dstImg[dstOff + 1] = image.data[srcOff + 1]!;
      dstImg[dstOff + 2] = image.data[srcOff + 2]!;
      dstImg[dstOff + 3] = image.data[srcOff + 3]!;
      dstMask[dstOff + 3] = mask.data[srcOff + 3]!;
    }
  }
  return {
    image: new ImageData(dstImg, cropW, cropH),
    mask: new ImageData(dstMask, cropW, cropH),
  };
}
