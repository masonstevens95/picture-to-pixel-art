import { type ChangeEvent } from "react";
import type { SmoothnessLevel } from "../pipeline/bilateral";

/**
 * Smoothness control: dropdown selecting the bilateral-filter strength.
 *
 * Mirrors the labeled-default-option pattern from `ChunkyPixelsControl`:
 * the no-op state ("Off") is explicitly tagged "(default)" so users
 * recognize it as off rather than as a typed-but-unstrengthened option.
 *
 * Levels map (in `bilateral.ts`) to (spatial-σ, range-σ, window radius):
 *   off    → identity (no computation, R12 short-circuit)
 *   low    → (1.0, 25, 2)
 *   medium → (2.0, 35, 4)
 *   high   → (3.0, 50, 6)
 */

export interface SmoothnessControlProps {
  value: SmoothnessLevel;
  onChange: (next: SmoothnessLevel) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{ value: SmoothnessLevel; label: string }> = [
  { value: "off", label: "Off (default)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function SmoothnessControl({
  value,
  onChange,
  disabled = false,
}: SmoothnessControlProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value as SmoothnessLevel);
  };

  return (
    <div className="space-y-2">
      <label htmlFor="smoothness-select" className="block text-sm font-medium text-neutral-200">
        Smoothness
      </label>
      <select
        id="smoothness-select"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {OPTIONS.map(({ value: v, label }) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SmoothnessControl;
