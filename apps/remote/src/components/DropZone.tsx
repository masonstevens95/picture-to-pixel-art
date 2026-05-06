import { useCallback, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

/**
 * DropZone is the primary input affordance — drag/drop OR keyboard/click on
 * the file picker, with explicit visual states. Calls `onChange(file)` once
 * a valid image is picked. Rejects non-image files with an inline error that
 * persists until the next valid pick (or until the user dismisses).
 */

export type DropZoneState = "idle" | "drag-over" | "drag-invalid" | "error";

export interface DropZoneProps {
  onChange: (file: File) => void;
  /** Optional accept filter — defaults to all image MIME types. */
  accept?: string;
  /** Set to disable interaction, e.g. while another job is processing. */
  disabled?: boolean;
}

const PROMPT_IDLE = "Drop a photo here, or click to choose";
const PROMPT_DRAGOVER = "Release to use this image";
const PROMPT_DRAG_INVALID = "That doesn't look like an image";
const ERROR_MSG = "That doesn't look like an image. Try a JPEG, PNG, or WEBP.";

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function dragHasAnyImage(event: DragEvent): boolean {
  // dataTransfer.items isn't always populated during dragover (browser quirk),
  // so this is a best-effort check used purely for visual hover state. The
  // authoritative type check happens on drop.
  const items = event.dataTransfer.items;
  if (!items || items.length === 0) return true;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && item.kind === "file" && (!item.type || item.type.startsWith("image/"))) {
      return true;
    }
  }
  return false;
}

export function DropZone({ onChange, accept = "image/*", disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<DropZoneState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null | undefined) => {
      if (!files || files.length === 0) return;
      const file = files[0]!;
      if (!isImageFile(file)) {
        setErrorMsg(ERROR_MSG);
        setState("error");
        return;
      }
      setErrorMsg(null);
      setState("idle");
      onChange(file);
    },
    [onChange],
  );

  const onDragOver = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setState(dragHasAnyImage(event) ? "drag-over" : "drag-invalid");
  };

  const onDragLeave = () => {
    if (disabled) return;
    setState((prev) => (prev === "drag-over" || prev === "drag-invalid" ? "idle" : prev));
  };

  const onDrop = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const dismissError = () => {
    setErrorMsg(null);
    setState("idle");
  };

  const baseClasses =
    "flex w-full cursor-pointer select-none flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950";

  const stateClasses: Record<DropZoneState, string> = {
    idle: "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800",
    "drag-over": "border-emerald-400 bg-emerald-950/40 text-emerald-200",
    "drag-invalid": "border-rose-500 bg-rose-950/40 text-rose-200",
    error: "border-rose-500 bg-rose-950/40 text-rose-200",
  };

  const disabledClasses = disabled ? "cursor-not-allowed opacity-50 hover:border-neutral-700" : "";

  const promptCopy =
    state === "drag-over" ? PROMPT_DRAGOVER : state === "drag-invalid" ? PROMPT_DRAG_INVALID : PROMPT_IDLE;

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload an image. Drop a file here or press Enter to choose one."
        aria-disabled={disabled}
        className={`${baseClasses} ${stateClasses[state]} ${disabledClasses}`}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={openPicker}
        onKeyDown={onKeyDown}
      >
        <p className="text-sm font-medium">{promptCopy}</p>
        <p className="mt-1 text-xs text-neutral-500">JPEG, PNG, or WEBP</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
          // Stop the click from bubbling to the parent div — otherwise a
          // programmatic input.click() (from keyboard activation) would fire
          // the parent's onClick and re-open the picker, doubling the call.
          onClick={(event) => event.stopPropagation()}
          disabled={disabled}
        />
      </div>
      {errorMsg && (
        <div
          role="alert"
          className="flex items-center justify-between rounded border border-rose-700 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={dismissError}
            className="ml-3 text-rose-400 hover:text-rose-200"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default DropZone;
