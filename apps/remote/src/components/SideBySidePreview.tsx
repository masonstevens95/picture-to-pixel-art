import { useEffect, useRef } from "react";

/**
 * Two-pane preview: source image on the left, pixelated result on the right.
 *
 * Result canvas is rendered at the buffer's native pixel size (e.g. 64x48)
 * and CSS-scaled up via `image-rendering: pixelated` so each output pixel
 * stays crisp at any display size. Below the `md` breakpoint the panes stack
 * vertically (source on top) — origin scope is desktop-primary but should
 * not break on phones.
 *
 * Status state drives the result pane's visual treatment: `processing` dims
 * any prior result while a new one is in flight, `error` shows a CTA, `idle`
 * shows a waiting placeholder before the first drop.
 */

export interface ResultBuffer {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface SideBySidePreviewProps {
  sourceUrl: string | null;
  result: ResultBuffer | null;
  status: "idle" | "processing" | "ready" | "error";
  errorMessage?: string | null;
  onRetry?: () => void;
}

export function SideBySidePreview({
  sourceUrl,
  result,
  status,
  errorMessage,
  onRetry,
}: SideBySidePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const imageData = new ImageData(
      new Uint8ClampedArray(result.pixels),
      result.width,
      result.height,
    );
    ctx.putImageData(imageData, 0, 0);
  }, [result]);

  const resultPaneClasses =
    "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 md:aspect-[4/3]";

  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
      <figure className="space-y-2">
        <figcaption className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Source
        </figcaption>
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 md:aspect-[4/3]">
          {sourceUrl ? (
            <img
              src={sourceUrl}
              alt="Source photo, awaiting conversion"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <p className="px-6 text-center text-sm text-neutral-500">
              Drop a photo to see it here.
            </p>
          )}
        </div>
      </figure>

      <figure className="space-y-2">
        <figcaption className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Pixel art
        </figcaption>
        <div className={resultPaneClasses}>
          {result ? (
            <canvas
              ref={canvasRef}
              className={`h-auto max-h-full max-w-full object-contain transition-opacity ${
                status === "processing" ? "opacity-60" : "opacity-100"
              }`}
              style={{ imageRendering: "pixelated" }}
              aria-label={`Pixel art at ${result.width} by ${result.height} pixels`}
            />
          ) : status === "processing" ? (
            <p className="text-sm text-neutral-400">Converting…</p>
          ) : status === "error" ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <p className="text-sm text-rose-300">{errorMessage ?? "Couldn't convert that image."}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:border-neutral-500 hover:bg-neutral-700"
                >
                  Drop a different image
                </button>
              )}
            </div>
          ) : (
            <p className="px-6 text-center text-sm text-neutral-500">
              Pixel art appears here once you drop a photo.
            </p>
          )}
        </div>
      </figure>
    </div>
  );
}

export default SideBySidePreview;
