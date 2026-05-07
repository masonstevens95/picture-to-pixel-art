import { type ChangeEvent } from "react";

/**
 * Palette-size dropdown. Discrete values with natural breakpoints. Default
 * 16 preserves v1/v2 behavior; painterly filters use 48; portraits use 24.
 */

export const PALETTE_SIZE_OPTIONS = [8, 16, 24, 32, 48, 64, 96, 128] as const;
export type PaletteSize = (typeof PALETTE_SIZE_OPTIONS)[number];

export interface PaletteSizeControlProps {
  paletteSize: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

export function PaletteSizeControl({
  paletteSize,
  onChange,
  disabled = false,
}: PaletteSizeControlProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <div className="space-y-2">
      <label htmlFor="palette-size-select" className="block text-sm font-medium text-neutral-200">
        Palette size
      </label>
      <select
        id="palette-size-select"
        value={paletteSize}
        onChange={handleChange}
        disabled={disabled}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {PALETTE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} colors
          </option>
        ))}
      </select>
    </div>
  );
}

export default PaletteSizeControl;
