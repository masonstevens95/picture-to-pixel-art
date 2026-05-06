import { type ChangeEvent } from "react";

/**
 * Continuous saturation slider over [-1, +1] in 0.05 steps. Default 0
 * (neutral) is reinforced visually by a center tick mark on the track
 * AND by muting the readout when value is exactly 0.
 *
 * Native <input type="range"> handles Home/End/PgUp/PgDn keyboard
 * navigation natively — no custom handler needed.
 */

const MIN = -1;
const MAX = 1;
const STEP = 0.05;

export interface SaturationSliderProps {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

function formatValue(v: number): string {
  if (v === 0) return "0.00";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}`;
}

export function SaturationSlider({ value, onChange, disabled = false }: SaturationSliderProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (Number.isFinite(next)) onChange(next);
  };

  const isNeutral = Math.abs(value) < 0.0001;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="pixelart-saturation" className="text-sm font-medium text-neutral-200">
          Saturation
        </label>
        <span
          className={`text-xs tabular-nums ${isNeutral ? "text-neutral-600" : "text-neutral-300"}`}
          aria-live="polite"
        >
          {formatValue(value)}
        </span>
      </div>
      <div className="relative">
        <input
          id="pixelart-saturation"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={value}
          aria-valuetext={`${formatValue(value)} saturation`}
          className="w-full cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {/* Center tick mark at value=0 to communicate the neutral position. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-neutral-600"
        />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
        <span aria-hidden="true">Gray</span>
        <span aria-hidden="true">Neutral</span>
        <span aria-hidden="true">Vivid</span>
      </div>
    </div>
  );
}

export default SaturationSlider;
