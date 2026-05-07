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
  },
  portrait: {
    id: "portrait",
    name: "Portrait",
    resolution: 128,
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
    /**
     * v4 smoothness. Optional here so callers that haven't been updated to
     * pass it (and presets that don't yet declare it) still match. U7
     * lifts smoothness onto FilterPreset proper; until then a missing
     * preset.smoothness is treated as 'off'.
     */
    smoothness?: "off" | "low" | "medium" | "high";
  },
  preset: FilterPreset & { smoothness?: "off" | "low" | "medium" | "high" },
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
  // v4 smoothness comparison. Both sides default to 'off' when undefined,
  // which is the v3-equivalent identity path. This means any v3 preset
  // (which has no smoothness field declared yet) still matches dials with
  // smoothness='off' — preserving the existing "Custom" detection
  // semantics — and any non-'off' dial setting flips to Custom.
  if ((dials.smoothness ?? "off") !== (preset.smoothness ?? "off")) return false;
  return true;
}
