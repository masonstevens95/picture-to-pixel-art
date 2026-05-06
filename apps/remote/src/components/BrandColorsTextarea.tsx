import { useEffect, useState } from "react";
import { parsePalette } from "../pipeline/parsePalette";
import type { RGB } from "../pipeline/palettes";

/**
 * Brand-color anchors. Reuses parsePalette from U4 — same hex format,
 * same forgiving parser, same silent-truncation-at-64 cap.
 *
 * UX hint: when brand colors are present alongside a curated or custom
 * palette, the merged palette won't look like a "pure" version of the
 * curated set. The hint surfaces only when the interaction is active so
 * it's quiet for the Auto+brand happy path. (Per design-lens doc review.)
 */

export interface BrandColorsTextareaProps {
  text: string;
  onTextChange: (text: string) => void;
  /** Emits the parsed colors when valid; null when empty or invalid. */
  onParsed: (colors: readonly RGB[] | null) => void;
  /** When true, surfaces the curated-vs-brand merge UX hint. */
  paletteOverridden?: boolean;
  disabled?: boolean;
}

export function BrandColorsTextarea({
  text,
  onTextChange,
  onParsed,
  paletteOverridden = false,
  disabled = false,
}: BrandColorsTextareaProps) {
  const [parseError, setParseError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (text.trim() === "") {
      setParseError(null);
      setTruncated(false);
      onParsed(null);
      return;
    }
    const result = parsePalette(text);
    if (result.ok) {
      setParseError(null);
      setTruncated(result.truncated);
      onParsed(result.colors);
    } else {
      setParseError(result.error);
      setTruncated(false);
      onParsed(null);
    }
  }, [text, onParsed]);

  return (
    <div className="space-y-1">
      <label
        htmlFor="brand-colors-textarea"
        className="block text-sm font-medium text-neutral-200"
      >
        Brand colors{" "}
        <span className="font-normal text-xs text-neutral-500">(optional)</span>
      </label>
      <p className="text-xs text-neutral-500">
        Hex codes that must appear in the output (e.g. logos or brand kits). Always added on top
        of the active palette.
      </p>
      <textarea
        id="brand-colors-textarea"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="#1a73e8&#10;#ff5500"
        rows={3}
        disabled={disabled}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-100 focus-visible:border-neutral-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        spellCheck={false}
      />
      {parseError && (
        <p role="alert" className="text-xs text-rose-300">
          {parseError}
        </p>
      )}
      {truncated && !parseError && (
        <p className="text-xs text-amber-300">Truncated to the first 64 colors.</p>
      )}
      {paletteOverridden && !parseError && text.trim() !== "" && (
        <p className="text-xs text-neutral-400">
          Brand colors merge with the active palette — the result may not look like a pure
          curated set.
        </p>
      )}
    </div>
  );
}

export default BrandColorsTextarea;
