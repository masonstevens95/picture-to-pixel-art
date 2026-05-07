import { type ChangeEvent } from "react";

/**
 * Chunky pixel control: dropdown 1×–4×.
 *
 * Per design-lens doc-review feedback, the no-op state is labeled
 * "1× (default)" so users see it as off rather than as just a number.
 */

export interface ChunkyPixelsControlProps {
  chunkSize: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "1× (default)" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
  { value: 4, label: "4×" },
];

export function ChunkyPixelsControl({
  chunkSize,
  onChange,
  disabled = false,
}: ChunkyPixelsControlProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <div className="space-y-2">
      <label htmlFor="chunky-pixels-select" className="block text-sm font-medium text-neutral-200">
        Chunky pixels
      </label>
      <select
        id="chunky-pixels-select"
        value={chunkSize}
        onChange={handleChange}
        disabled={disabled}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ChunkyPixelsControl;
