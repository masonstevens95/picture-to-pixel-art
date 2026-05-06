import { useCallback, useEffect, useRef, useState } from "react";
import DropZone from "../components/DropZone";
import ResolutionSlider from "../components/ResolutionSlider";
import SideBySidePreview from "../components/SideBySidePreview";
import { usePixelArtPipeline } from "../hooks/usePixelArtPipeline";
import type { ValidLongEdge } from "../pipeline/protocol";

/**
 * Default-exported entry point for the pixel-art microfrontend.
 *
 * Two consumers load this same component:
 *   - Portfolio host: `lazy(() => import("remote/PixelArtApp"))` via Module Federation.
 *   - Standalone harness: direct workspace-aliased import.
 *
 * No props, no context dependencies — the component owns all of its own state
 * and is fully self-contained. Origin spec is desktop-primary; below the `md`
 * breakpoint the side-by-side panes stack vertically.
 */

const DEFAULT_RESOLUTION: ValidLongEdge = 64;

export default function PixelArtApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ValidLongEdge>(DEFAULT_RESOLUTION);
  const sourceBitmapRef = useRef<ImageBitmap | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  const { state, process } = usePixelArtPipeline();

  // Object-URL lifecycle. Whenever the source file changes, mint a new URL
  // for the source <img> preview and revoke the previous one.
  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sourceFile]);

  // Decode source -> ImageBitmap and dispatch when file or resolution changes.
  useEffect(() => {
    if (!sourceFile) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;

    (async () => {
      try {
        bitmap = await createImageBitmap(sourceFile);
        if (cancelled) {
          bitmap.close();
          return;
        }
        // Close the previous bitmap before replacing — prevents leak across
        // file replacements.
        sourceBitmapRef.current?.close();
        sourceBitmapRef.current = bitmap;
        // The pipeline transfers ownership of the bitmap on dispatch, so clone
        // before sending to keep our retained reference valid for the next
        // resolution change.
        const transferable = await createImageBitmap(bitmap);
        process(transferable, resolution);
      } catch {
        // The pipeline hook surfaces worker errors; decode errors here are a
        // separate path. Surface them via a synthetic error state.
        if (!cancelled) {
          // No-op for now; could wire a state setter if decode-error UX matters.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceFile, resolution, process]);

  // Cleanup retained source bitmap on unmount.
  useEffect(() => {
    return () => {
      sourceBitmapRef.current?.close();
      sourceBitmapRef.current = null;
    };
  }, []);

  // Live-region announcement on status transitions for screen readers.
  useEffect(() => {
    const region = liveRegionRef.current;
    if (!region) return;
    if (state.status === "processing") {
      region.textContent = "Converting image";
    } else if (state.status === "ready" && state.result) {
      region.textContent = `Pixel art ready at ${state.result.width} by ${state.result.height} pixels`;
    } else if (state.status === "error") {
      region.textContent = "Could not convert image. Drop a different file.";
    }
  }, [state]);

  const handleFile = useCallback((file: File) => {
    setSourceFile(file);
  }, []);

  const handleRetry = useCallback(() => {
    setSourceFile(null);
  }, []);

  const hasImage = sourceFile !== null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <DropZone onChange={handleFile} disabled={false} />

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <ResolutionSlider value={resolution} onChange={setResolution} disabled={!hasImage} />
      </div>

      <SideBySidePreview
        sourceUrl={sourceUrl}
        result={state.result}
        status={state.status}
        errorMessage={state.error?.message}
        onRetry={handleRetry}
      />
    </div>
  );
}
