import { type ChangeEvent } from "react";
import { VALID_LONG_EDGES, type ValidLongEdge } from "../pipeline/protocol";

/**
 * Discrete resolution slider over the 5 v1 stops (16, 32, 64, 128, 256).
 *
 * Implementation note: a bare native <input type="range"> mapped over an index
 * tuple. Native handles Home/End to jump to ends and PgUp/PgDn to step by
 * larger increments — no custom key handler needed.
 */

export interface ResolutionSliderProps {
  value: ValidLongEdge;
  onChange: (next: ValidLongEdge) => void;
  disabled?: boolean;
}

export function ResolutionSlider({ value, onChange, disabled = false }: ResolutionSliderProps) {
  const index = VALID_LONG_EDGES.indexOf(value);
  const safeIndex = index >= 0 ? index : 2; // default to 64

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = VALID_LONG_EDGES[Number(event.target.value)];
    if (next !== undefined) onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="pixelart-resolution" className="text-sm font-medium text-neutral-200">
          Output resolution
        </label>
        <span className="text-xs tabular-nums text-neutral-400" aria-live="polite">
          {value} px
        </span>
      </div>
      <input
        id="pixelart-resolution"
        type="range"
        min={0}
        max={VALID_LONG_EDGES.length - 1}
        step={1}
        value={safeIndex}
        onChange={handleChange}
        disabled={disabled}
        aria-valuemin={VALID_LONG_EDGES[0]}
        aria-valuemax={VALID_LONG_EDGES[VALID_LONG_EDGES.length - 1]}
        aria-valuenow={value}
        aria-valuetext={`${value} pixels`}
        className="w-full cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
        {VALID_LONG_EDGES.map((stop) => (
          <span key={stop} aria-hidden="true">
            {stop}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ResolutionSlider;
