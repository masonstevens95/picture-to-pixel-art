import { type ChangeEvent } from "react";
import type { RGB } from "../pipeline/palettes";

/**
 * Outline transform control: enable toggle, width 1-3, color picker.
 *
 * Native <input type="color"> for the picker per design-lens doc-review;
 * accepts the cross-browser styling variance as v3 quality bar. Wrapped
 * in a styled label so Tailwind controls the surrounding chrome.
 */

export interface OutlineControlValue {
  enabled: boolean;
  width: number;
  color: RGB;
}

export interface OutlineControlProps {
  value: OutlineControlValue;
  onChange: (next: OutlineControlValue) => void;
  disabled?: boolean;
}

function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): RGB {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return [r, g, b];
}

export function OutlineControl({ value, onChange, disabled = false }: OutlineControlProps) {
  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, enabled: event.target.checked });
  };

  const handleWidthChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...value, width: Number(event.target.value) });
  };

  const handleColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, color: hexToRgb(event.target.value) });
  };

  const subDisabled = disabled || !value.enabled;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-neutral-200">Outline</legend>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={handleEnabledChange}
          disabled={disabled}
          className="accent-emerald-400"
        />
        <span>Enable outline</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Width</span>
          <select
            value={value.width}
            onChange={handleWidthChange}
            disabled={subDisabled}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value={1}>1 px</option>
            <option value={2}>2 px</option>
            <option value={3}>3 px</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Color</span>
          <input
            type="color"
            value={rgbToHex(value.color)}
            onChange={handleColorChange}
            disabled={subDisabled}
            className="h-7 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Outline color"
          />
        </label>
      </div>
    </fieldset>
  );
}

export default OutlineControl;
