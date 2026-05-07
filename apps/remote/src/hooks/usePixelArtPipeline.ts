import { useCallback, useEffect, useRef, useState } from "react";
import {
  isFirstRenderEndMessage,
  isFirstRenderStartMessage,
  isMLErrorMessage,
  isMLStatusMessage,
  isProcessResult,
  isWorkerError,
  type MLErrorMessage,
  type MLStage,
  type MLStatusMessage,
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

/**
 * v4 ML status surfaced to the UI. One entry per stage; absent stage means
 * "never attempted" (the U2-NetP / Face Landmarker hasn't been hit yet).
 *
 * U8 reads this slice to drive the ModelLoadIndicator (loading) and
 * DegradedModeNotice (failed) components.
 */
export type MLPhase = "loading" | "ready" | "failed";

export type MLStatusMap = Partial<Record<MLStage, MLPhase>>;

export interface PipelineState {
  status: PipelineStatus;
  result: ProcessResult | null;
  error: WorkerErrorMessage | null;
  /** Latest phase emitted per ML stage. Empty until first stage attempt. */
  mlStatus: MLStatusMap;
  /** Latest ml-error per stage. Cleared only across hook remounts. */
  mlError: MLErrorMessage | null;
  /**
   * U8 first-render lifecycle. True between a `first-render-start` and the
   * matching `first-render-end` for the most-recently dispatched source.
   * Drives the FirstRenderSpinner overlay on the result pane.
   *
   * The hook does NOT track sourceId — the worker's emit cadence (one
   * pair per new source) means a simple boolean is sufficient. If the
   * worker becomes capable of overlapping renders for different sources
   * in the future, this can be promoted to a `Set<string>` without
   * changing the protocol.
   */
  firstRenderActive: boolean;
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
  /**
   * v4 opaque source identity. Required — every dispatch carries one.
   * The component mints a fresh UUID on each new file load and forwards
   * the same id for every subsequent dispatch on the same file. The
   * worker keys its source cache on this id.
   */
  sourceId: string;
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
  /** v3 palette size override. Undefined = 16 (v2 default). */
  paletteSize?: number;
  /**
   * v4 cartoon-smoothing strength. Undefined = 'off' = identity (R12).
   * Forwarded as ProcessRequest.smoothness; the worker's source cache keys
   * its bilateral output on this value.
   */
  smoothness?: "off" | "low" | "medium" | "high";
  /**
   * v4 silhouette quality. Undefined = 'fast' (v3 naive corner-sample;
   * R12 invariant). 'smart' triggers the U2-NetP path in the worker;
   * model load failure falls back to 'fast' and emits an `ml-error`
   * outbound message that the hook reflects in `state.mlError`.
   */
  silhouetteQuality?: "fast" | "smart";
  /**
   * v4 face-aware contrast boost gate (U6). Undefined / false = R12
   * baseline; the worker MUST skip MediaPipe Face Landmarker detection
   * entirely (no model load on the default path). True triggers the
   * U6 detect + boost stage; failures emit an `ml-error` outbound and
   * fall back to identity (no boost applied).
   */
  faceAwareEnabled?: boolean;
}

export interface UsePixelArtPipelineApi {
  state: PipelineState;
  process: (bitmap: ImageBitmap, targetLongEdge: number, options: ProcessOptions) => void;
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
    mlStatus: {},
    mlError: null,
    firstRenderActive: false,
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
        setState((prev) => ({ ...prev, status: "ready", result: msg, error: null }));
        return;
      }
      if (isWorkerError(msg)) {
        if (msg.jobId !== latestJobIdRef.current) return;
        setState((prev) => ({ ...prev, status: "error", result: null, error: msg }));
        return;
      }
      // ML status / error messages are not jobId-keyed — they are session-
      // level signals (the model loaded once for the whole session, so the
      // status reflects the most recent transition regardless of which job
      // triggered it). We merge into state without affecting `status`/`result`.
      if (isMLStatusMessage(msg)) {
        const update = msg as MLStatusMessage;
        setState((prev) => ({
          ...prev,
          mlStatus: { ...prev.mlStatus, [update.stage]: update.phase },
        }));
        return;
      }
      if (isMLErrorMessage(msg)) {
        const update = msg as MLErrorMessage;
        setState((prev) => ({ ...prev, mlError: update }));
        return;
      }
      // U8 first-render-* lifecycle. Not jobId-keyed — the worker emits
      // them once per new sourceId regardless of which job triggered the
      // first dispatch. The hook just toggles a boolean; PixelArtApp wires
      // it to FirstRenderSpinner.
      if (isFirstRenderStartMessage(msg)) {
        setState((prev) => ({ ...prev, firstRenderActive: true }));
        return;
      }
      if (isFirstRenderEndMessage(msg)) {
        setState((prev) => ({ ...prev, firstRenderActive: false }));
        return;
      }
    }
  }, [workerFactory]);

  const process = useCallback(
    (bitmap: ImageBitmap, targetLongEdge: number, options: ProcessOptions) => {
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
          sourceId: queued.options.sourceId,
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
          paletteSize: queued.options.paletteSize,
          smoothness: queued.options.smoothness,
          silhouetteQuality: queued.options.silhouetteQuality,
          faceAwareEnabled: queued.options.faceAwareEnabled,
        };

        setState((prev) => ({ ...prev, status: "processing", error: null }));
        worker.postMessage(message, [queued.bitmap]);
      }, debounceMs);
    },
    [debounceMs],
  );

  return { state, process };
}
