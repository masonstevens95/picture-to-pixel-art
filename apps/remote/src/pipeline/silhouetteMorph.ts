/**
 * Source-resolution alpha-mask morphology (v4.2).
 *
 * Three ops applied at SOURCE resolution, before downscale:
 *
 *   - closeMask(radius)  → dilate then erode (alpha-only). Fills small
 *     holes inside the subject and fuses fragmented foreground regions;
 *     net size is approximately preserved. Useful when the U2-NetP mask
 *     has tiny holes that area-average downscale would otherwise leak
 *     through.
 *
 *   - dilateSubject(image, mask, radius) → pure dilation that fattens
 *     thin features so they survive aggressive downscale. Operates on
 *     BOTH alpha (extending the mask outward) AND RGB (extending the
 *     subject's edge colors outward through the new halo). Without the
 *     RGB spread, the dilated halo would show the photo's background
 *     pixels through the now-foreground alpha — e.g. a white halo
 *     around an olive-drab mortar on a white photo background. Each
 *     newly-fg pixel takes its RGB from the first 4-neighbor that was
 *     already foreground in the prior pass; iterating R passes spreads
 *     subject colors R pixels outward.
 *
 *   - erodeMask(radius) → pure erosion (alpha-only). Treats outside the
 *     image as background, so edge pixels erode. Used internally by
 *     closeMask; not currently exposed on the worker dispatch path.
 *
 * Radius is denominated in source pixels. All ops short-circuit to
 * identity when radius ≤ 0, preserving the v4.1 invariant.
 */

export interface DilateSubjectResult {
  image: ImageData;
  mask: ImageData;
}

/**
 * Fattens both the alpha mask and the subject's RGB outward.
 *
 * For each newly-foreground pixel, copies RGB from the first
 * 4-neighbor that was foreground in the prior pass. Iterating R
 * passes propagates subject edge colors R pixels into the halo.
 *
 * Boundary-leak guard: U2-Net masks routinely classify ~1-3 source
 * pixels of background as foreground along the subject edge, because
 * the binary cutoff lands on anti-aliased transition pixels. If we
 * spread RGB starting from those pixels, we propagate bg colors
 * outward (white halo around an olive subject on a white bg).
 *
 * Mitigation: pre-erode the mask by `BOUNDARY_CLEANUP` source pixels
 * to peel off the leaky boundary, then dilate by `radius +
 * BOUNDARY_CLEANUP` so the net outward growth still equals `radius`.
 * The spread sources are now firmly inside the subject. Cleanup is
 * clamped to `radius` so a dilate=1 doesn't accidentally shrink the
 * mask. Subjects thinner than 2*BOUNDARY_CLEANUP source pixels (e.g.
 * a 3-px tripod leg with cleanup=2) lose mass to the erode pass —
 * acceptable since those features wouldn't survive aggressive
 * fattening anyway, and the surviving fragments still get spread.
 */
const BOUNDARY_CLEANUP = 2;

export function dilateSubject(
  image: ImageData,
  mask: ImageData,
  radius: number,
): DilateSubjectResult {
  if (radius <= 0) return { image, mask };
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error(
      `dilateSubject dim mismatch: image ${image.width}x${image.height}, mask ${mask.width}x${mask.height}`,
    );
  }
  const w = mask.width;
  const h = mask.height;
  const cleanupR = Math.min(BOUNDARY_CLEANUP, radius);
  const inputMask = cleanupR > 0 ? erodeMask(mask, cleanupR) : mask;
  const totalRadius = radius + cleanupR;
  let curMask = new Uint8ClampedArray(inputMask.data);
  let curImg = new Uint8ClampedArray(image.data);
  for (let pass = 0; pass < totalRadius; pass++) {
    const nextMask = new Uint8ClampedArray(curMask);
    const nextImg = new Uint8ClampedArray(curImg);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const aIdx = (y * w + x) * 4 + 3;
        if (curMask[aIdx] === 255) continue;
        // Find first 4-neighbor that's currently foreground; copy its
        // RGB into the new pixel and mark it foreground in the new mask.
        let nbrA = -1;
        if (x > 0 && curMask[aIdx - 4] === 255) nbrA = aIdx - 4;
        else if (x < w - 1 && curMask[aIdx + 4] === 255) nbrA = aIdx + 4;
        else if (y > 0 && curMask[aIdx - w * 4] === 255) nbrA = aIdx - w * 4;
        else if (y < h - 1 && curMask[aIdx + w * 4] === 255) nbrA = aIdx + w * 4;
        if (nbrA >= 0) {
          nextMask[aIdx] = 255;
          // RGB lives at indices [aIdx-3, aIdx-2, aIdx-1] for the same pixel.
          const rgbDst = aIdx - 3;
          const rgbSrc = nbrA - 3;
          nextImg[rgbDst] = curImg[rgbSrc]!;
          nextImg[rgbDst + 1] = curImg[rgbSrc + 1]!;
          nextImg[rgbDst + 2] = curImg[rgbSrc + 2]!;
        }
      }
    }
    curMask = nextMask;
    curImg = nextImg;
  }
  return {
    image: new ImageData(curImg, w, h),
    mask: new ImageData(curMask, w, h),
  };
}

/**
 * Pure alpha-mask dilation (no RGB spread). Used internally by closeMask
 * since the mask gets eroded back to ~original size, hiding any halo
 * pixels — RGB spread would be wasted work.
 */
function dilateMaskOnly(mask: ImageData, radius: number): ImageData {
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
  return erodeMask(dilateMaskOnly(mask, radius), radius);
}
