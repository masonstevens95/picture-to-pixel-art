import { useCallback, useEffect, useRef, useState } from "react";
import {
  isProcessResult,
  isWorkerError,
  type ProcessRequest,
  type ProcessResult,
  type WorkerErrorMessage,
} from "../pipeline/protocol";

/**
 * Owns the worker, debounces slider input, and discards stale results by
 * comparing each result's jobId against the latest dispatched id.
 *
 * Cancellation strategy: monotonic jobId. The hook tracks the latest id it
 * dispatched (`latestJobIdRef`); any worker message whose jobId is below
 * that is silently dropped. Combined with ~16ms debounce, this collapses
 * slider drags to one in-flight job at a time without an explicit abort
 * message back to the worker.
 */

const DEFAULT_DEBOUNCE_MS = 16;

export type PipelineStatus = "idle" | "processing" | "ready" | "error";

export interface PipelineState {
  status: PipelineStatus;
  result: ProcessResult | null;
  error: WorkerErrorMessage | null;
}

export interface UsePixelArtPipelineOptions {
  /** Debounce window for `process` calls; defaults to 16ms. */
  debounceMs?: number;
  /**
   * Override the worker factory — primarily for tests. Production callers
   * should leave this unset; the default factory points at the real worker.
   */
  workerFactory?: () => Worker;
}

export interface ProcessOptions {
  /** -1..+1, default 0. Forwarded as ProcessRequest.saturation. */
  saturation?: number;
  /** Width/height. Undefined preserves source aspect (v1 default). */
  aspectRatio?: number;
  /** Curated or custom palette. Undefined uses Auto (Wu over source). */
  fixedPalette?: readonly (readonly [number, number, number])[];
  /** Additive brand-color anchors. */
  brandColors?: readonly (readonly [number, number, number])[];
  /** v3 outline transform options. */
  outlineEnabled?: boolean;
  outlineWidth?: number;
  outlineColor?: readonly [number, number, number];
  /** v3 posterization bands (2-8). Undefined = off. */
  posterizeBands?: number;
  /** v3 silhouette options. */
  silhouetteEnabled?: boolean;
  silhouetteTolerance?: number;
  /** v3 chunky pixel size (1-4). Undefined or 1 = no-op. */
  chunkSize?: number;
}

export interface UsePixelArtPipelineApi {
  state: PipelineState;
  process: (bitmap: ImageBitmap, targetLongEdge: number, options?: ProcessOptions) => void;
}

const defaultWorkerFactory = (): Worker =>
  new Worker(new URL("../pipeline/pixelArtWorker.ts", import.meta.url), { type: "module" });

export function usePixelArtPipeline(
  options: UsePixelArtPipelineOptions = {},
): UsePixelArtPipelineApi {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, workerFactory = defaultWorkerFactory } = options;

  const [state, setState] = useState<PipelineState>({
    status: "idle",
    result: null,
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const latestJobIdRef = useRef(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDispatchRef = useRef<
    { bitmap: ImageBitmap; targetLongEdge: number; options: ProcessOptions } | null
  >(null);

  useEffect(() => {
    const worker = workerFactory();
    workerRef.current = worker;

    worker.addEventListener("message", handleMessage);

    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      workerRef.current = null;
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      // If a dispatch was queued but never sent, the bitmap is still owned
      // by the main thread — release it here so it isn't leaked on unmount.
      if (pendingDispatchRef.current) {
        pendingDispatchRef.current.bitmap.close();
        pendingDispatchRef.current = null;
      }
    };

    function handleMessage(event: MessageEvent<unknown>): void {
      const msg = event.data;
      if (isProcessResult(msg)) {
        if (msg.jobId !== latestJobIdRef.current) return; // superseded
        setState({ status: "ready", result: msg, error: null });
        return;
      }
      if (isWorkerError(msg)) {
        if (msg.jobId !== latestJobIdRef.current) return;
        setState({ status: "error", result: null, error: msg });
      }
    }
  }, [workerFactory]);

  const process = useCallback(
    (bitmap: ImageBitmap, targetLongEdge: number, options: ProcessOptions = {}) => {
      if (!Number.isFinite(targetLongEdge) || targetLongEdge <= 0) {
        // Reject at the boundary — don't dispatch garbage to the worker.
        bitmap.close();
        return;
      }

      // Drop any earlier queued dispatch that hasn't fired yet — its bitmap
      // would be stranded otherwise.
      if (pendingDispatchRef.current) {
        pendingDispatchRef.current.bitmap.close();
      }
      pendingDispatchRef.current = { bitmap, targetLongEdge, options };

      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
      }

      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        const queued = pendingDispatchRef.current;
        pendingDispatchRef.current = null;
        const worker = workerRef.current;
        if (!queued || !worker) {
          if (queued) queued.bitmap.close();
          return;
        }

        latestJobIdRef.current += 1;
        const jobId = latestJobIdRef.current;
        const message: ProcessRequest = {
          type: "process",
          jobId,
          bitmap: queued.bitmap,
          targetLongEdge: queued.targetLongEdge,
          saturation: queued.options.saturation,
          aspectRatio: queued.options.aspectRatio,
          fixedPalette: queued.options.fixedPalette,
          brandColors: queued.options.brandColors,
          outlineEnabled: queued.options.outlineEnabled,
          outlineWidth: queued.options.outlineWidth,
          outlineColor: queued.options.outlineColor,
          posterizeBands: queued.options.posterizeBands,
          silhouetteEnabled: queued.options.silhouetteEnabled,
          silhouetteTolerance: queued.options.silhouetteTolerance,
          chunkSize: queued.options.chunkSize,
        };

        setState((prev) => ({ ...prev, status: "processing", error: null }));
        worker.postMessage(message, [queued.bitmap]);
      }, debounceMs);
    },
    [debounceMs],
  );

  return { state, process };
}
