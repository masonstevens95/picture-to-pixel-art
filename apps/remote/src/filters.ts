/**
 * Filter preset catalog. Each preset bundles every dial value the v3 UI
 * exposes — populating a filter sets all dials at once.
 *
 * Adding a new filter is a data-only change: append to FILTERS, add the
 * id to FILTER_IDS, and the UI picks it up automatically.
 *
 * Origin per-filter table is the authoritative source for these values.
 * Tweaking any default here changes user-visible product behavior.
 */

import type { ValidLongEdge } from "./pipeline/protocol";
import type { CuratedPaletteId, RGB } from "./pipeline/palettes";
import type { PaletteMode } from "./components/PaletteModeControl";
import type { SilhouetteQuality } from "./components/SilhouetteControl";
import type { SmoothnessLevel } from "./pipeline/bilateral";

export const FILTER_IDS = [
  "art-piece",
  "portrait",
  "units",
  "asset",
  "environment",
] as const;
export type FilterId = (typeof FILTER_IDS)[number];

export interface FilterPreset {
  id: FilterId;
  name: string;
  resolution: ValidLongEdge;
  saturation: number;
  /** undefined = Source aspect (no crop). number = W/H ratio. */
  aspectRatio: number | undefined;
  paletteMode: PaletteMode;
  curatedPaletteId: CuratedPaletteId;
  paletteSize: number;
  /** Custom palette text + brand colors stay empty for v3 filters. */
  outlineEnabled: boolean;
  outlineWidth: number;
  outlineColor: RGB;
  /** undefined = posterization off. */
  posterizeBands: number | undefined;
  silhouetteEnabled: boolean;
  silhouetteTolerance: number;
  chunkSize: number;
  /**
   * v4 cartoon-smoothing level (U3). 'off' is the R12 invariant baseline:
   * the worker bilateral stage short-circuits and the source cache stores
   * the input by reference. Painterly filters (Art piece, Environment)
   * keep 'off'; the cartoon filters (Portrait, Units) use 'medium', and
   * Asset uses 'low'.
   */
  smoothness: SmoothnessLevel;
  /**
   * v4 face-aware contrast boost (U6). Default false is the R12 baseline:
   * the worker MUST skip MediaPipe `detectLandmarks` entirely when this is
   * false. U7 enables this only for the Portrait filter where eye/mouth/
   * nose visibility matters at low resolutions.
   */
  faceAwareEnabled: boolean;
  /**
   * v4 silhouette quality (U5). 'fast' is the R12 invariant baseline (the
   * existing chroma-key path). 'smart' opts into ML segmentation. Asset is
   * the only v4 filter where the user-visible default is 'smart'. Recorded
   * on every preset so the dial-match comparison flips to "modified" when
   * the user changes only this value.
   */
  silhouetteQuality: SilhouetteQuality;
}

const BLACK: RGB = [0, 0, 0];

export const FILTERS: Readonly<Record<FilterId, FilterPreset>> = {
  "art-piece": {
    id: "art-piece",
    name: "Art piece",
    resolution: 256,
    saturation: 0,
    aspectRatio: undefined,
    paletteMode: "auto",
    curatedPaletteId: "pico-8",
    paletteSize: 48,
    outlineEnabled: false,
    outlineWidth: 1,
    outlineColor: BLACK,
    posterizeBands: undefined,
    silhouetteEnabled: false,
    silhouetteTolerance: 12,
    chunkSize: 1,
    // Painterly preset — no smoothing, no face boost, fast silhouette.
    // v3 values preserved exactly; only additive v4 fields appended.
    smoothness: "off",
    faceAwareEnabled: false,
    silhouetteQuality: "fast",
  },
  portrait: {
    id: "portrait",
    name: "Portrait",
    // v4: raised from 128 → 192 long edge so face features (eyes / mouth /
    // nose) survive quantization. 192 is in VALID_LONG_EDGES.
    resolution: 192,
    saturation: 0.1,
    aspectRatio: undefined,
    paletteMode: "auto",
    curatedPaletteId: "pico-8",
    paletteSize: 24,
    outlineEnabled: true,
    outlineWidth: 1,
    outlineColor: BLACK,
    posterizeBands: 6,
    silhouetteEnabled: false,
    silhouetteTolerance: 12,
    chunkSize: 1,
    // v4: cartoon smoothing + face-aware boost.
    smoothness: "medium",
    faceAwareEnabled: true,
    silhouetteQuality: "fast",
  },
  units: {
    id: "units",
    name: "Units",
    resolution: 64,
    saturation: 0.3,
    aspectRatio: 1,
    paletteMode: "curated",
    curatedPaletteId: "pico-8",
    paletteSize: 16,
    outlineEnabled: true,
    outlineWidth: 3,
    outlineColor: BLACK,
    posterizeBands: 4,
    silhouetteEnabled: false,
    silhouetteTolerance: 12,
    chunkSize: 2,
    // v4: cartoon smoothing for unit sprites; no face boost; fast silhouette.
    smoothness: "medium",
    faceAwareEnabled: false,
    silhouetteQuality: "fast",
  },
  asset: {
    id: "asset",
    name: "Asset",
    resolution: 48,
    saturation: 0.2,
    aspectRatio: 1,
    paletteMode: "curated",
    curatedPaletteId: "ega-16",
    paletteSize: 16,
    outlineEnabled: true,
    outlineWidth: 3,
    outlineColor: BLACK,
    posterizeBands: 4,
    silhouetteEnabled: true,
    silhouetteTolerance: 12,
    chunkSize: 1,
    // v4: light smoothing + ML segmentation default for clean cutouts.
    smoothness: "low",
    faceAwareEnabled: false,
    silhouetteQuality: "smart",
  },
  environment: {
    id: "environment",
    name: "Environment",
    resolution: 192,
    saturation: 0.1,
    aspectRatio: 4 / 3,
    paletteMode: "auto",
    curatedPaletteId: "pico-8",
    paletteSize: 48,
    outlineEnabled: false,
    outlineWidth: 1,
    outlineColor: BLACK,
    posterizeBands: undefined,
    silhouetteEnabled: false,
    silhouetteTolerance: 12,
    chunkSize: 1,
    // Painterly preset — preserves gradient; no smoothing.
    smoothness: "off",
    faceAwareEnabled: false,
    silhouetteQuality: "fast",
  },
};

/**
 * Float-aware equality for filter-state diffing. Used by the modified-state
 * detection in PixelArtApp; saturation and silhouetteTolerance can drift by
 * floating-point noise on slider drags, so strict === would produce false
 * "Custom (was: X)" flips.
 */
const FLOAT_EPS = 1e-3;

export function eqRgb(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function dialsMatchPreset(
  dials: {
    resolution: number;
    saturation: number;
    aspectRatio: number | undefined;
    paletteMode: PaletteMode;
    curatedPaletteId: CuratedPaletteId;
    paletteSize: number;
    outlineEnabled: boolean;
    outlineWidth: number;
    outlineColor: RGB;
    posterizeBands: number | undefined;
    silhouetteEnabled: boolean;
    silhouetteTolerance: number;
    chunkSize: number;
    smoothness: SmoothnessLevel;
    faceAwareEnabled: boolean;
    silhouetteQuality: SilhouetteQuality;
  },
  preset: FilterPreset,
): boolean {
  if (dials.resolution !== preset.resolution) return false;
  if (Math.abs(dials.saturation - preset.saturation) > FLOAT_EPS) return false;
  if (dials.aspectRatio === undefined || preset.aspectRatio === undefined) {
    if (dials.aspectRatio !== preset.aspectRatio) return false;
  } else if (Math.abs(dials.aspectRatio - preset.aspectRatio) > FLOAT_EPS) {
    return false;
  }
  if (dials.paletteMode !== preset.paletteMode) return false;
  if (dials.paletteMode === "curated" && dials.curatedPaletteId !== preset.curatedPaletteId) {
    return false;
  }
  if (dials.paletteSize !== preset.paletteSize) return false;
  if (dials.outlineEnabled !== preset.outlineEnabled) return false;
  if (dials.outlineEnabled) {
    if (dials.outlineWidth !== preset.outlineWidth) return false;
    if (!eqRgb(dials.outlineColor, preset.outlineColor)) return false;
  }
  if (dials.posterizeBands !== preset.posterizeBands) return false;
  if (dials.silhouetteEnabled !== preset.silhouetteEnabled) return false;
  if (
    dials.silhouetteEnabled &&
    Math.abs(dials.silhouetteTolerance - preset.silhouetteTolerance) > FLOAT_EPS
  ) {
    return false;
  }
  if (dials.chunkSize !== preset.chunkSize) return false;
  // v4 smoothness: string equality. Any drift from preset flips to "Custom".
  if (dials.smoothness !== preset.smoothness) return false;
  // v4 face-aware: strict boolean equality. Toggling face-boost on/off
  // away from the preset's value flips to "Custom".
  if (dials.faceAwareEnabled !== preset.faceAwareEnabled) return false;
  // v4 silhouette quality: string equality. Recorded on every preset so a
  // user changing only Quality (Fast ↔ Smart) marks the style "modified",
  // even when silhouetteEnabled itself is false.
  if (dials.silhouetteQuality !== preset.silhouetteQuality) return false;
  return true;
}
