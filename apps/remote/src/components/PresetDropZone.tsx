import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { extractTextChunk } from "../pipeline/pngMetadata";
import { parsePreset, PRESET_TEXT_CHUNK_KEYWORD, type Preset } from "../pipeline/preset";

/**
 * Compact drop zone for loading a previously-exported pixel-art PNG and
 * recovering the preset that produced it. A successful read fires
 * `onLoad(preset)` so the parent can apply every dial; failure emits a
 * one-shot error message that clears on the next valid drop.
 *
 * Distinct from `DropZone`: that one feeds the source-photo pipeline; this
 * one only restores dial state. The dropped image itself isn't rendered —
 * it's parsed for its embedded tEXt metadata and discarded.
 */

export interface PresetDropZoneProps {
  onLoad: (preset: Preset) => void;
  disabled?: boolean;
}

const ERROR_NO_PRESET =
  "No preset metadata in this PNG. Drop a file produced by this app's Download button.";
const ERROR_BAD_PRESET = "Preset metadata is malformed or from an incompatible version.";
const ERROR_NOT_PNG = "Drop a PNG file. JPEG/WEBP can't carry preset metadata.";

async function readPresetFromFile(file: File): Promise<{ preset?: Preset; error?: string }> {
  if (!file.name.toLowerCase().endsWith(".png") && file.type !== "image/png") {
    return { error: ERROR_NOT_PNG };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const text = extractTextChunk(buf, PRESET_TEXT_CHUNK_KEYWORD);
  if (!text) return { error: ERROR_NO_PRESET };
  const preset = parsePreset(text);
  if (!preset) return { error: ERROR_BAD_PRESET };
  return { preset };
}

export default function PresetDropZone({ onLoad, disabled = false }: PresetDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const { preset, error: msg } = await readPresetFromFile(file);
      if (preset) {
        setError(null);
        setLoadedFrom(file.name);
        onLoad(preset);
      } else {
        setLoadedFrom(null);
        setError(msg ?? ERROR_BAD_PRESET);
      }
    },
    [onLoad],
  );

  const onDragOver = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setHover(true);
  };
  const onDragLeave = () => setHover(false);
  const onDrop = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  return (
    <div
      className={`rounded-md border border-dashed px-3 py-2 text-xs transition-colors ${
        disabled
          ? "border-neutral-800 text-neutral-600"
          : hover
            ? "border-emerald-400 bg-emerald-500/5 text-emerald-200"
            : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="block w-full text-left disabled:cursor-not-allowed"
      >
        <span className="font-medium text-neutral-300">Load preset from PNG</span>
        <span className="ml-2 text-neutral-500">
          drop a previously-exported pixel-art PNG to restore its dials
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        onChange={onPick}
        className="sr-only"
      />
      {error && (
        <p role="status" aria-live="polite" className="mt-1 text-amber-400">
          {error}
        </p>
      )}
      {loadedFrom && !error && (
        <p role="status" aria-live="polite" className="mt-1 text-emerald-400">
          Restored dials from {loadedFrom}
        </p>
      )}
    </div>
  );
}
