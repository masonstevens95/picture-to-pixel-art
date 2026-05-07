import { type ChangeEvent } from "react";

/**
 * Posterization control: enable toggle + bands dropdown.
 *
 * bands=undefined (off) is the v2-equivalent default. When enabled, bands
 * range 2-8. Includes 7 (per design-lens doc-review feedback — origin says
 * "2-8" so 7 should be a valid choice).
 */

export interface PosterizationControlProps {
  bands: number | undefined;
  onChange: (next: number | undefined) => void;
  disabled?: boolean;
}

const BAND_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export function PosterizationControl({ bands, onChange, disabled = false }: PosterizationControlProps) {
  const enabled = bands !== undefined;

  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked ? 4 : undefined);
  };

  const handleBandsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-neutral-200">Posterization</legend>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleEnabledChange}
          disabled={disabled}
          className="accent-emerald-400"
        />
        <span>Enable posterization</span>
      </label>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <span>Bands</span>
        <select
          value={enabled ? bands : 4}
          onChange={handleBandsChange}
          disabled={disabled || !enabled}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Posterization bands"
        >
          {BAND_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

export default PosterizationControl;
