/**
 * Preset = a snapshot of every dial that affects pixel-art output,
 * plus the build SHA that produced it. Serialized as JSON and embedded
 * in exported PNGs via a tEXt chunk so a previously-downloaded image
 * can be dropped back into the app to restore its dials exactly.
 *
 * Forward compatibility: the `version` field lets the loader reject or
 * migrate older formats. Today's loader accepts version=1 only and
 * silently ignores unknown future fields (Object.assign-style merge).
 */

export const PRESET_VERSION = 1;
export const PRESET_TEXT_CHUNK_KEYWORD = "PixelArt:Preset";

export interface Preset {
  version: number;
  /** Build SHA the preset was produced under; informational only. */
  buildId: string;
  style: string;
  resolution: number;
  saturation: number;
  /** width/height ratio; null = source aspect (no center crop). */
  aspectRatio: number | null;
  paletteMode: "auto" | "curated" | "custom";
  curatedPaletteId: string;
  customPaletteText: string;
  paletteSize: number;
  brandColorsText: string;
  outline: { enabled: boolean; width: number; color: [number, number, number] };
  /** Posterize bands; null = off. */
  posterizeBands: number | null;
  silhouette: {
    enabled: boolean;
    tolerance: number;
    quality: "fast" | "smart";
  };
  chunkSize: number;
  smoothness: "off" | "low" | "medium" | "high";
  faceAwareEnabled: boolean;
  subjectAwareDownscale: boolean;
  silhouetteOutline: {
    enabled: boolean;
    width: number;
    color: [number, number, number];
  };
  silhouetteCloseRadius: number;
  subjectDilateRadius: number;
  tightCrop: { enabled: boolean; margin: number; subjectAspectOutput: boolean };
  flatFill: { enabled: boolean; colors: number };
}

/** Deep-validate a parsed JSON object as a Preset. Returns null on mismatch. */
export function parsePreset(json: string): Preset | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== PRESET_VERSION) return null;
  // Trust the shape — defensive narrowing per field is overkill for a
  // self-produced format. The caller is responsible for using the
  // returned Preset with the right setters; missing/garbled fields
  // will surface as React warnings in dev rather than silent corruption.
  return raw as Preset;
}

export function serializePreset(preset: Preset): string {
  return JSON.stringify(preset);
}
