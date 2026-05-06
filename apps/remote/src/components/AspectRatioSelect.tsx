import { type ChangeEvent, useState } from "react";

/**
 * Aspect-ratio selector. Five named options + Custom (W:H number inputs).
 *
 * `Source` is the v1 default and emits `undefined` (no crop). Custom uses
 * two number inputs with no arbitrary upper bound — users entering 16:9
 * via 16 and 9 should not be rejected just because some other ratio (like
 * 239:100 for cinema 2.39:1) is also valid. The pipeline-side centerCrop
 * function validates the geometry.
 */

export type AspectRatioValue = number | undefined;

export interface AspectRatioSelectProps {
  value: AspectRatioValue;
  onChange: (next: AspectRatioValue) => void;
  disabled?: boolean;
}

type PresetKey = "source" | "square" | "portrait" | "landscape" | "custom";

const PRESETS: Record<PresetKey, { label: string; ratio: AspectRatioValue }> = {
  source: { label: "Source (preserve)", ratio: undefined },
  square: { label: "Square (1:1)", ratio: 1 },
  portrait: { label: "Portrait (3:4)", ratio: 3 / 4 },
  landscape: { label: "Landscape (4:3)", ratio: 4 / 3 },
  custom: { label: "Custom…", ratio: undefined },
};

function presetForValue(value: AspectRatioValue): PresetKey {
  if (value === undefined) return "source";
  if (Math.abs(value - 1) < 1e-6) return "square";
  if (Math.abs(value - 3 / 4) < 1e-6) return "portrait";
  if (Math.abs(value - 4 / 3) < 1e-6) return "landscape";
  return "custom";
}

export function AspectRatioSelect({ value, onChange, disabled = false }: AspectRatioSelectProps) {
  const initialPreset = presetForValue(value);
  const [preset, setPreset] = useState<PresetKey>(initialPreset);
  const [customW, setCustomW] = useState<string>(initialPreset === "custom" && value ? "16" : "16");
  const [customH, setCustomH] = useState<string>(initialPreset === "custom" && value ? "9" : "9");
  const [customError, setCustomError] = useState<string | null>(null);

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as PresetKey;
    setPreset(next);
    setCustomError(null);
    if (next !== "custom") {
      onChange(PRESETS[next].ratio);
    } else {
      // Apply current custom values immediately when switching to Custom.
      tryApplyCustom(customW, customH);
    }
  };

  const tryApplyCustom = (wRaw: string, hRaw: string) => {
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      setCustomError("Enter positive numbers for both W and H.");
      return;
    }
    setCustomError(null);
    onChange(w / h);
  };

  const handleCustomW = (event: ChangeEvent<HTMLInputElement>) => {
    setCustomW(event.target.value);
    if (preset === "custom") tryApplyCustom(event.target.value, customH);
  };

  const handleCustomH = (event: ChangeEvent<HTMLInputElement>) => {
    setCustomH(event.target.value);
    if (preset === "custom") tryApplyCustom(customW, event.target.value);
  };

  return (
    <div className="space-y-2">
      <label htmlFor="pixelart-aspect" className="text-sm font-medium text-neutral-200">
        Aspect ratio
      </label>
      <select
        id="pixelart-aspect"
        value={preset}
        onChange={handlePresetChange}
        disabled={disabled}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <option key={key} value={key}>
            {PRESETS[key].label}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400">W</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={customW}
            onChange={handleCustomW}
            disabled={disabled}
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm tabular-nums text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Custom aspect width"
          />
          <span className="text-xs text-neutral-400">:</span>
          <span className="text-xs text-neutral-400">H</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={customH}
            onChange={handleCustomH}
            disabled={disabled}
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm tabular-nums text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Custom aspect height"
          />
          <span className="text-xs text-neutral-500">Enter ratio parts (e.g. 16 and 9 for 16:9)</span>
        </div>
      )}
      {customError && (
        <p role="alert" className="text-xs text-rose-300">
          {customError}
        </p>
      )}
    </div>
  );
}

export default AspectRatioSelect;
