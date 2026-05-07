import { describe, expect, it } from "vitest";
import { dialsMatchPreset, eqRgb, FILTERS, FILTER_IDS } from "../src/filters";

describe("FILTERS catalog", () => {
  it("contains exactly 5 filters with stable ids", () => {
    expect([...FILTER_IDS]).toEqual(["art-piece", "portrait", "units", "asset", "environment"]);
  });

  it("every filter has all required dial values", () => {
    for (const id of FILTER_IDS) {
      const f = FILTERS[id];
      expect(f.id).toBe(id);
      expect(typeof f.name).toBe("string");
      expect(f.resolution).toBeGreaterThan(0);
      expect(f.saturation).toBeGreaterThanOrEqual(-1);
      expect(f.saturation).toBeLessThanOrEqual(1);
      expect(["auto", "curated", "custom"]).toContain(f.paletteMode);
      expect(f.paletteSize).toBeGreaterThan(0);
      expect(typeof f.outlineEnabled).toBe("boolean");
      expect([1, 2, 3]).toContain(f.outlineWidth);
      expect(f.outlineColor.length).toBe(3);
      expect(typeof f.silhouetteEnabled).toBe("boolean");
      expect(f.chunkSize).toBeGreaterThanOrEqual(1);
      expect(f.chunkSize).toBeLessThanOrEqual(4);
      // v4 fields (U7) — every preset must declare values for these.
      expect(["off", "low", "medium", "high"]).toContain(f.smoothness);
      expect(typeof f.faceAwareEnabled).toBe("boolean");
      expect(["fast", "smart"]).toContain(f.silhouetteQuality);
    }
  });

  it("Asset filter has silhouette ON (origin per-filter table)", () => {
    expect(FILTERS.asset.silhouetteEnabled).toBe(true);
  });

  it("Units filter has chunky=2 (origin per-filter table)", () => {
    expect(FILTERS.units.chunkSize).toBe(2);
  });

  it("Art piece and Environment have no outlines, no posterization", () => {
    for (const id of ["art-piece", "environment"] as const) {
      expect(FILTERS[id].outlineEnabled).toBe(false);
      expect(FILTERS[id].posterizeBands).toBeUndefined();
    }
  });

  // ---- v4 (U7) per-filter assertions ----

  it("Asset filter defaults to silhouetteQuality=smart (Covers AE2)", () => {
    expect(FILTERS.asset.silhouetteQuality).toBe("smart");
  });

  it("Portrait filter raises resolution to 192 and enables faceAware (Covers AE4)", () => {
    expect(FILTERS.portrait.resolution).toBe(192);
    expect(FILTERS.portrait.faceAwareEnabled).toBe(true);
  });

  it("Portrait filter uses medium smoothing and thin black outline + posterize 6", () => {
    expect(FILTERS.portrait.smoothness).toBe("medium");
    expect(FILTERS.portrait.outlineEnabled).toBe(true);
    expect(FILTERS.portrait.outlineWidth).toBe(1);
    expect(FILTERS.portrait.outlineColor).toEqual([0, 0, 0]);
    expect(FILTERS.portrait.posterizeBands).toBe(6);
  });

  it("Units filter uses medium smoothing; v3 dial values unchanged", () => {
    expect(FILTERS.units.smoothness).toBe("medium");
    expect(FILTERS.units.faceAwareEnabled).toBe(false);
    expect(FILTERS.units.silhouetteQuality).toBe("fast");
    // v3 invariant values.
    expect(FILTERS.units.outlineEnabled).toBe(true);
    expect(FILTERS.units.outlineWidth).toBe(3);
    expect(FILTERS.units.posterizeBands).toBe(4);
    expect(FILTERS.units.chunkSize).toBe(2);
  });

  it("Asset filter uses low smoothing; v3 dials (resolution 48, thick outline) unchanged", () => {
    expect(FILTERS.asset.smoothness).toBe("low");
    expect(FILTERS.asset.faceAwareEnabled).toBe(false);
    expect(FILTERS.asset.resolution).toBe(48);
    expect(FILTERS.asset.outlineEnabled).toBe(true);
    expect(FILTERS.asset.outlineWidth).toBe(3);
    expect(FILTERS.asset.posterizeBands).toBe(4);
  });

  it("Art piece and Environment keep smoothness=off (painterly, no smoothing)", () => {
    for (const id of ["art-piece", "environment"] as const) {
      expect(FILTERS[id].smoothness).toBe("off");
      expect(FILTERS[id].faceAwareEnabled).toBe(false);
      expect(FILTERS[id].silhouetteQuality).toBe("fast");
    }
  });
});

describe("eqRgb", () => {
  it("returns true for identical tuples", () => {
    expect(eqRgb([10, 20, 30], [10, 20, 30])).toBe(true);
  });

  it("returns false when any channel differs", () => {
    expect(eqRgb([10, 20, 30], [10, 20, 31])).toBe(false);
    expect(eqRgb([10, 20, 30], [10, 21, 30])).toBe(false);
    expect(eqRgb([10, 20, 30], [11, 20, 30])).toBe(false);
  });
});

function presetDials(presetId: keyof typeof FILTERS) {
  const p = FILTERS[presetId];
  return {
    resolution: p.resolution,
    saturation: p.saturation,
    aspectRatio: p.aspectRatio,
    paletteMode: p.paletteMode,
    curatedPaletteId: p.curatedPaletteId,
    paletteSize: p.paletteSize,
    outlineEnabled: p.outlineEnabled,
    outlineWidth: p.outlineWidth,
    outlineColor: p.outlineColor,
    posterizeBands: p.posterizeBands,
    silhouetteEnabled: p.silhouetteEnabled,
    silhouetteTolerance: p.silhouetteTolerance,
    chunkSize: p.chunkSize,
    smoothness: p.smoothness,
    faceAwareEnabled: p.faceAwareEnabled,
    silhouetteQuality: p.silhouetteQuality,
  };
}

describe("dialsMatchPreset", () => {
  it("matches when dials exactly equal preset values", () => {
    expect(dialsMatchPreset(presetDials("units"), FILTERS.units)).toBe(true);
  });

  it("returns false when any dial diverges", () => {
    const dials = presetDials("units");
    dials.saturation = dials.saturation + 0.5;
    expect(dialsMatchPreset(dials, FILTERS.units)).toBe(false);
  });

  it("uses float epsilon for saturation (drag-noise-tolerant)", () => {
    const dials = presetDials("units");
    dials.saturation = dials.saturation + 1e-7;
    expect(dialsMatchPreset(dials, FILTERS.units)).toBe(true);
  });

  it("compares outlineColor element-wise (not reference equality)", () => {
    const dials = presetDials("units");
    dials.outlineColor = [...FILTERS.units.outlineColor];
    expect(dialsMatchPreset(dials, FILTERS.units)).toBe(true);
    dials.outlineColor = [255, 0, 0];
    expect(dialsMatchPreset(dials, FILTERS.units)).toBe(false);
  });

  it("ignores outlineWidth/outlineColor when outline is disabled in both dials and preset", () => {
    const dials = presetDials("art-piece");
    dials.outlineWidth = 99;
    dials.outlineColor = [123, 45, 67];
    // outline is disabled in the preset, so width/color are irrelevant.
    expect(dialsMatchPreset(dials, FILTERS["art-piece"])).toBe(true);
  });

  it("ignores curatedPaletteId when paletteMode is not 'curated'", () => {
    const dials = presetDials("art-piece");
    dials.curatedPaletteId = "ega-16"; // preset uses pico-8 but mode is auto
    expect(dialsMatchPreset(dials, FILTERS["art-piece"])).toBe(true);
  });

  it("compares aspectRatio with epsilon for fractional ratios (Environment 4/3)", () => {
    const dials = presetDials("environment");
    dials.aspectRatio = 4 / 3 + 1e-7;
    expect(dialsMatchPreset(dials, FILTERS.environment)).toBe(true);
  });

  it("undefined-vs-number aspectRatio differs", () => {
    const dials = presetDials("environment");
    dials.aspectRatio = undefined;
    expect(dialsMatchPreset(dials, FILTERS.environment)).toBe(false);
  });

  // ---- v4 (U7) edge cases ----

  it("flips to modified when only smoothness diverges", () => {
    const dials = presetDials("portrait");
    expect(dialsMatchPreset(dials, FILTERS.portrait)).toBe(true);
    dials.smoothness = "high";
    expect(dialsMatchPreset(dials, FILTERS.portrait)).toBe(false);
  });

  it("flips to modified when only faceAwareEnabled diverges", () => {
    const dials = presetDials("portrait");
    expect(dialsMatchPreset(dials, FILTERS.portrait)).toBe(true);
    dials.faceAwareEnabled = !FILTERS.portrait.faceAwareEnabled;
    expect(dialsMatchPreset(dials, FILTERS.portrait)).toBe(false);
  });

  it("flips to modified when only silhouetteQuality diverges", () => {
    const dials = presetDials("asset");
    expect(dialsMatchPreset(dials, FILTERS.asset)).toBe(true);
    dials.silhouetteQuality = "fast";
    expect(dialsMatchPreset(dials, FILTERS.asset)).toBe(false);
  });

  it("matches all v4 filters with their own preset values", () => {
    for (const id of FILTER_IDS) {
      expect(dialsMatchPreset(presetDials(id), FILTERS[id])).toBe(true);
    }
  });
});
