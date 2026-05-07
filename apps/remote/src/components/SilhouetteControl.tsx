import { type ChangeEvent } from "react";
import {
  DEFAULT_SILHOUETTE_TOLERANCE,
  MAX_SILHOUETTE_TOLERANCE,
} from "../pipeline/silhouette";

/**
 * Silhouette / background-removal control: enable toggle + tolerance slider.
 *
 * Quality bar is "naive corner-sample, works for clean backgrounds."
 * Helper line states this so users know to pick clean source images.
 */

export interface SilhouetteControlProps {
  enabled: boolean;
  tolerance: number;
  onEnabledChange: (enabled: boolean) => void;
  onToleranceChange: (tolerance: number) => void;
  disabled?: boolean;
}

export function SilhouetteControl({
  enabled,
  tolerance,
  onEnabledChange,
  onToleranceChange,
  disabled = false,
}: SilhouetteControlProps) {
  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    onEnabledChange(event.target.checked);
  };

  const handleToleranceChange = (event: ChangeEvent<HTMLInputElement>) => {
    onToleranceChange(Number(event.target.value));
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-neutral-200">Silhouette</legend>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleEnabledChange}
          disabled={disabled}
          className="accent-emerald-400"
        />
        <span>Remove background</span>
      </label>
      <p className="text-xs text-neutral-500">
        Works best on photos with a clean, uniform background.
      </p>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="w-20">Tolerance</span>
        <input
          type="range"
          min={0}
          max={MAX_SILHOUETTE_TOLERANCE}
          step={1}
          value={tolerance}
          onChange={handleToleranceChange}
          disabled={disabled || !enabled}
          aria-label="Background tolerance"
          className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="w-8 text-right tabular-nums text-neutral-300">{tolerance}</span>
      </label>
    </fieldset>
  );
}

export { DEFAULT_SILHOUETTE_TOLERANCE };
export default SilhouetteControl;
