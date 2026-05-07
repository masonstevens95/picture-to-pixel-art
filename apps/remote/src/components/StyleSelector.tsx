import { forwardRef, type ChangeEvent } from "react";
import { FILTERS, FILTER_IDS, type FilterId } from "../filters";

/**
 * Top-level Style selector. Dropdown of Custom + 5 filter presets.
 *
 * Per design-lens doc-review: enabled regardless of image-load state so
 * users can pre-arm a Style before dropping (F3 game-asset workflow).
 *
 * "Custom (was: X)" indicator + Reset button surface only when the user
 * has drifted from a previously-applied filter. aria-live='polite' on the
 * indicator container so screen readers announce drift on dial change.
 *
 * Reset button focuses the select element after activation so keyboard
 * users stay oriented.
 */

export type StyleSelectorValue = FilterId | "custom";

export interface StyleSelectorProps {
  value: StyleSelectorValue;
  /** When the value is "custom" but the user just drifted from a preset, this
   * carries the previous filter id so the indicator can show "was: X". */
  previousFilter: FilterId | null;
  onPickFilter: (next: FilterId) => void;
  onPickCustom: () => void;
  onReset: () => void;
}

export const StyleSelector = forwardRef<HTMLSelectElement, StyleSelectorProps>(
  function StyleSelector({ value, previousFilter, onPickFilter, onPickCustom, onReset }, ref) {
    const handleSelect = (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as StyleSelectorValue;
      if (next === "custom") onPickCustom();
      else onPickFilter(next as FilterId);
    };

    const showIndicator = value === "custom" && previousFilter !== null;
    const previousName = previousFilter ? FILTERS[previousFilter].name : "";

    return (
      <div className="space-y-1">
        <label htmlFor="pixelart-style" className="block text-sm font-medium text-neutral-200">
          Style
        </label>
        <select
          id="pixelart-style"
          ref={ref}
          value={value}
          onChange={handleSelect}
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none"
        >
          <option value="custom">Custom</option>
          {FILTER_IDS.map((id) => (
            <option key={id} value={id}>
              {FILTERS[id].name}
            </option>
          ))}
        </select>
        <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
          {showIndicator && (
            <p className="text-xs text-amber-300">
              <span>Custom (was: {previousName})</span>{" "}
              <button
                type="button"
                onClick={onReset}
                className="ml-1 underline underline-offset-2 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                Reset to {previousName}
              </button>
            </p>
          )}
        </div>
      </div>
    );
  },
);

export default StyleSelector;
