/**
 * Curated palette catalog. Each entry is a fixed list of RGB tuples
 * shipped statically — no external fetch, no Lospec API, no runtime
 * data load.
 *
 * v2 ships three retro classics (per scope-guardian doc-review
 * recommendation: smallest catalog that demonstrates the feature).
 * Adding more is data-only — no code changes required.
 *
 * Color references:
 * - Game Boy DMG: the original 4-shade green LCD palette as cited in
 *   the DMG-CPU-01 hardware spec. Approximated to the commonly-used
 *   "DMG green" emulator palette.
 * - PICO-8: official 16-color fantasy console palette as published by
 *   Lexaloffle. https://pico-8.fandom.com/wiki/Palette
 * - EGA-16: the 16-color IBM EGA default palette, as standardized in
 *   the original 1984 EGA BIOS.
 */

export type RGB = readonly [number, number, number];

export interface CuratedPalette {
  readonly name: string;
  readonly colors: readonly RGB[];
}

export const CURATED_PALETTE_IDS = ["gameboy-dmg", "pico-8", "ega-16"] as const;
export type CuratedPaletteId = (typeof CURATED_PALETTE_IDS)[number];

export const CURATED_PALETTES: Readonly<Record<CuratedPaletteId, CuratedPalette>> = {
  "gameboy-dmg": {
    name: "Game Boy DMG",
    colors: [
      [15, 56, 15], // darkest green
      [48, 98, 48],
      [139, 172, 15],
      [155, 188, 15], // lightest green
    ],
  },
  "pico-8": {
    name: "PICO-8",
    colors: [
      [0, 0, 0], // black
      [29, 43, 83], // dark blue
      [126, 37, 83], // dark purple
      [0, 135, 81], // dark green
      [171, 82, 54], // brown
      [95, 87, 79], // dark gray
      [194, 195, 199], // light gray
      [255, 241, 232], // white
      [255, 0, 77], // red
      [255, 163, 0], // orange
      [255, 236, 39], // yellow
      [0, 228, 54], // green
      [41, 173, 255], // blue
      [131, 118, 156], // lavender
      [255, 119, 168], // pink
      [255, 204, 170], // peach
    ],
  },
  "ega-16": {
    name: "EGA-16",
    colors: [
      [0, 0, 0],
      [0, 0, 170],
      [0, 170, 0],
      [0, 170, 170],
      [170, 0, 0],
      [170, 0, 170],
      [170, 85, 0],
      [170, 170, 170],
      [85, 85, 85],
      [85, 85, 255],
      [85, 255, 85],
      [85, 255, 255],
      [255, 85, 85],
      [255, 85, 255],
      [255, 255, 85],
      [255, 255, 255],
    ],
  },
};

export function getCuratedPalette(id: CuratedPaletteId): CuratedPalette {
  const palette = CURATED_PALETTES[id];
  if (!palette) throw new Error(`Unknown curated palette id: ${id}`);
  return palette;
}
