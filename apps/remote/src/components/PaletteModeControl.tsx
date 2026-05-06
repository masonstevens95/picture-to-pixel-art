import { useEffect, useState, type ChangeEvent } from "react";
import {
  CURATED_PALETTE_IDS,
  CURATED_PALETTES,
  type CuratedPaletteId,
} from "../pipeline/palettes";
import { parsePalette } from "../pipeline/parsePalette";
import type { RGB } from "../pipeline/palettes";

/**
 * Palette mode selector: Auto (v1 default), Curated, or Custom.
 *
 * Mode sub-state is preserved across mode switches per design-lens
 * doc-review feedback — switching from Custom to Auto and back keeps
 * the user's pasted hex codes intact. Only visibility changes; values
 * persist for the session.
 */

export type PaletteMode = "auto" | "curated" | "custom";

const MODE_OPTIONS: ReadonlyArray<{ value: PaletteMode; label: string }> = [
  { value: "auto", label: "Auto from image" },
  { value: "curated", label: "Curated" },
  { value: "custom", label: "Custom" },
];

export interface PaletteModeControlProps {
  mode: PaletteMode;
  onModeChange: (next: PaletteMode) => void;
  curatedPaletteId: CuratedPaletteId;
  onCuratedPaletteIdChange: (id: CuratedPaletteId) => void;
  customPaletteText: string;
  onCustomPaletteTextChange: (text: string) => void;
  /** Emits when the parsed custom palette becomes valid; null when invalid/empty. */
  onCustomPaletteParsed: (colors: readonly RGB[] | null) => void;
  disabled?: boolean;
}

export function PaletteModeControl({
  mode,
  onModeChange,
  curatedPaletteId,
  onCuratedPaletteIdChange,
  customPaletteText,
  onCustomPaletteTextChange,
  onCustomPaletteParsed,
  disabled = false,
}: PaletteModeControlProps) {
  const [parseError, setParseError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  // Re-parse custom whenever its text changes — emit the parsed colors so
  // the parent can pass them down to the worker pipeline.
  useEffect(() => {
    if (mode !== "custom") {
      // Don't surface custom parse errors when the user isn't viewing custom.
      setParseError(null);
      setTruncated(false);
      return;
    }
    if (customPaletteText.trim() === "") {
      setParseError(null);
      setTruncated(false);
      onCustomPaletteParsed(null);
      return;
    }
    const result = parsePalette(customPaletteText);
    if (result.ok) {
      setParseError(null);
      setTruncated(result.truncated);
      onCustomPaletteParsed(result.colors);
    } else {
      setParseError(result.error);
      setTruncated(false);
      onCustomPaletteParsed(null);
    }
  }, [mode, customPaletteText, onCustomPaletteParsed]);

  const handleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    onModeChange(event.target.value as PaletteMode);
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium text-neutral-200">Palette</legend>

      <div className="flex flex-wrap gap-3">
        {MODE_OPTIONS.map(({ value, label }) => (
          <label
            key={value}
            className="flex items-center gap-2 text-sm text-neutral-200 disabled:opacity-50"
          >
            <input
              type="radio"
              name="palette-mode"
              value={value}
              checked={mode === value}
              onChange={handleModeChange}
              className="accent-emerald-400"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {mode === "curated" && (
        <div>
          <label
            htmlFor="curated-palette-select"
            className="block text-xs uppercase tracking-wider text-neutral-500"
          >
            Curated palette
          </label>
          <select
            id="curated-palette-select"
            value={curatedPaletteId}
            onChange={(e) => onCuratedPaletteIdChange(e.target.value as CuratedPaletteId)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {CURATED_PALETTE_IDS.map((id) => (
              <option key={id} value={id}>
                {CURATED_PALETTES[id].name} ({CURATED_PALETTES[id].colors.length} colors)
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-1">
          <label
            htmlFor="custom-palette-textarea"
            className="block text-xs uppercase tracking-wider text-neutral-500"
          >
            Custom palette (paste hex codes)
          </label>
          <textarea
            id="custom-palette-textarea"
            value={customPaletteText}
            onChange={(e) => onCustomPaletteTextChange(e.target.value)}
            placeholder="#000000&#10;#ffffff&#10;#ff0000"
            rows={5}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            spellCheck={false}
          />
          {parseError && (
            <p role="alert" className="text-xs text-rose-300">
              {parseError}
            </p>
          )}
          {truncated && !parseError && (
            <p className="text-xs text-amber-300">
              Truncated to the first 64 colors.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

export default PaletteModeControl;
