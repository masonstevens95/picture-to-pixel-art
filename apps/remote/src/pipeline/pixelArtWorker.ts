/// <reference lib="webworker" />
import type {
  MLErrorCode,
  MLErrorMessage,
  MLStatusMessage,
  ProcessRequest,
  ProcessResult,
  WorkerErrorMessage,
  WorkerInboundMessage,
} from "./protocol";
import { bilateralFilter } from "./bilateral";
import { centerCrop } from "./crop";
import { areaAverageDownscale } from "./downscale";
import { chunkify } from "./chunky";
import { applyFaceBoost } from "./faceBoost";
import { applyOutline, DEFAULT_OUTLINE_COLOR } from "./outline";
import { posterize } from "./posterize";
import { quantizePalette } from "./quantize";
import { saturationAdjust } from "./saturation";
import {
  applyMask,
  buildMask,
  DEFAULT_SILHOUETTE_TOLERANCE,
  downscaleMask,
  sampleBackgroundColor,
} from "./silhouette";
import { SourceCacheManager } from "./sourceCache";
import { runAndCacheLandmarks } from "../ml/faceLandmarks";
import { runAndCacheSegmentation } from "../ml/segmentation";
import { MLRuntimeError, type MLRuntimeErrorCode } from "../ml/types";

/**
 * Worker entrypoint.
 *
 * Pipeline per `process` message:
 *   bitmap -> composite-onto-neutral -> ImageData (opaque)
 *          -> areaAverageDownscale(target dims)
 *          -> quantizePalette(16 colors, Wu)
 *          -> postMessage with transferred buffer
 *
 * Alpha is normalized once at the composite step — the source ImageBitmap
 * may have transparency (PNGs, decoded SVGs), but everything downstream of
 * the composite assumes fully opaque pixels. Origin spec is fully opaque
 * v1 output; this is the single point in the pipeline where that invariant
 * is enforced.
 */

declare const self: DedicatedWorkerGlobalScope;

const NEUTRAL_BACKGROUND = "#171717"; // Tailwind neutral-900, matches host chrome.
const DEFAULT_PALETTE_SIZE = 16;

/**
 * Module-level source cache manager (U2 scaffolding). U3/U5/U6 will read
 * and write its slots; for U2 it is instantiated, eviction is driven on
 * each request, and the active entry is plumbed into the dispatch handler
 * so future units can hang their cached values off it without further
 * surgery here.
 */
const sourceCacheManager = new SourceCacheManager();

/**
 * Per-session emitted-once flags for `ml-error` outbound messages.
 *
 * Why module-level: the worker instance lives for the lifetime of the
 * pixel-art tab. The R7 / R8 contract is "surface the degraded notice
 * once per session, not on every dispatch" — repeated emit would spam
 * the main-thread state. Stage-keyed because U6 will share this map.
 */
const mlErrorEmitted: Record<"segmentation" | "face-landmarks", boolean> = {
  segmentation: false,
  "face-landmarks": false,
};

/**
 * Per-session ml-status memo: emit transitions, not every dispatch.
 * 'loading' fires the first time we attempt a stage; 'ready' once on
 * the first successful inference; 'failed' once on the first error.
 */
const mlStatusEmitted: Record<
  "segmentation" | "face-landmarks",
  { loading: boolean; ready: boolean; failed: boolean }
> = {
  segmentation: { loading: false, ready: false, failed: false },
  "face-landmarks": { loading: false, ready: false, failed: false },
};

function emitMLStatus(stage: MLStatusMessage["stage"], phase: MLStatusMessage["phase"]): void {
  if (mlStatusEmitted[stage][phase]) return;
  mlStatusEmitted[stage][phase] = true;
  const msg: MLStatusMessage = { type: "ml-status", stage, phase };
  self.postMessage(msg);
}

function emitMLError(stage: MLErrorMessage["stage"], code: MLErrorCode): void {
  if (mlErrorEmitted[stage]) return;
  mlErrorEmitted[stage] = true;
  const msg: MLErrorMessage = { type: "ml-error", stage, code };
  self.postMessage(msg);
}

/**
 * Coerce an unknown thrown value into the wire-shape MLErrorCode. Catches
 * the case where ORT throws something other than our typed error.
 */
function toMLErrorCode(err: unknown): MLErrorCode {
  if (err instanceof MLRuntimeError) {
    // MLRuntimeErrorCode and MLErrorCode are deliberately the same
    // enum; cast is safe (kept narrow so a future divergence shows up
    // as a type error rather than at runtime).
    return err.code satisfies MLRuntimeErrorCode;
  }
  return "inference_failed";
}

/** Test-only: clear the per-session emit memos so a fresh test starts cleanly. */
export function __resetWorkerMLStateForTests(): void {
  mlErrorEmitted.segmentation = false;
  mlErrorEmitted["face-landmarks"] = false;
  mlStatusEmitted.segmentation = { loading: false, ready: false, failed: false };
  mlStatusEmitted["face-landmarks"] = { loading: false, ready: false, failed: false };
}

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;
  if (msg?.type === "process") {
    handleProcess(msg, sourceCacheManager).catch((err) => {
      postError(msg.jobId, "internal_error", err instanceof Error ? err.message : String(err));
    });
  }
});

async function handleProcess(
  msg: ProcessRequest,
  cacheManager: SourceCacheManager,
): Promise<void> {
  const { jobId, bitmap, targetLongEdge, sourceId } = msg;

  // U2: take (or replace) the active source cache entry. New sourceId
  // evicts the previous entry; same sourceId returns the same reference
  // so source-cached stages (U3 bilateral, U5 segmentation, U6 landmarks)
  // survive across requests for the same source.
  const cache = cacheManager.getOrInit(sourceId);

  if (!Number.isFinite(targetLongEdge) || targetLongEdge <= 0) {
    postError(jobId, "invalid_input", `targetLongEdge must be positive, got ${targetLongEdge}`);
    bitmap.close();
    return;
  }

  // Capture dims BEFORE closing the bitmap — close() zeroes width/height,
  // and we still need the source dims for getImageData below.
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  if (srcW <= 0 || srcH <= 0) {
    postError(jobId, "invalid_input", `Source bitmap has zero dimension: ${srcW}x${srcH}`);
    bitmap.close();
    return;
  }

  // Step 1: rasterize the source bitmap onto a same-size canvas with a
  // neutral background underneath. This collapses any alpha into solid RGB.
  const sourceCanvas = new OffscreenCanvas(srcW, srcH);
  const sourceCtx = sourceCanvas.getContext("2d", { colorSpace: "srgb" });
  if (!sourceCtx) {
    postError(jobId, "internal_error", "Could not acquire source 2D context");
    bitmap.close();
    return;
  }
  sourceCtx.fillStyle = NEUTRAL_BACKGROUND;
  sourceCtx.fillRect(0, 0, srcW, srcH);
  sourceCtx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const sourceImageData = sourceCtx.getImageData(0, 0, srcW, srcH);

  // Step 1a (U3): cartoon-smoothing bilateral filter, source-cached.
  // 'off' (or undefined) short-circuits inside bilateralFilter to return
  // the input ImageData by reference — v3-equivalent identity. Cached on
  // the source-id so smoothness changes alone don't re-rasterize, and so
  // downstream slider drags (saturation, outline, etc.) reuse the same
  // smoothed source.
  const smoothness = msg.smoothness ?? "off";
  const smoothnessKey = "bilateral:" + smoothness;
  let smoothed: ImageData;
  if (cache.bilateralOutput && cache.smoothnessKey === smoothnessKey) {
    smoothed = cache.bilateralOutput;
  } else {
    smoothed = bilateralFilter(sourceImageData, smoothness);
    cache.bilateralOutput = smoothed;
    cache.smoothnessKey = smoothnessKey;
  }

  // Step 1b (U6): face landmarks + landmark-aware contrast boost, source-cached.
  //
  // R12 GATE (load-bearing): when `faceAwareEnabled !== true` we skip the
  // detector entirely. No `import('@mediapipe/tasks-vision')`, no
  // `.task` fetch, no fileset download. Without this gate the ~3-4 MB
  // MediaPipe bundle would lazy-load on every R12-default dispatch on a
  // new source-id, violating both R12 (byte-identical default output)
  // and R6 (lazy load only on cartoon-feature use).
  //
  // The detector is invoked at most once per source-id: `landmarksAttempted`
  // gates re-runs. After detection (success OR no-face-detected), the
  // result is cached and applyFaceBoost short-circuits naturally on null.
  const faceAwareEnabled = msg.faceAwareEnabled === true;
  if (faceAwareEnabled && !cache.landmarksAttempted) {
    emitMLStatus("face-landmarks", "loading");
    try {
      await runAndCacheLandmarks(smoothed, sourceId, cacheManager);
      emitMLStatus("face-landmarks", "ready");
    } catch (err) {
      emitMLStatus("face-landmarks", "failed");
      emitMLError("face-landmarks", toMLErrorCode(err));
      // Mark attempted on the active cache so we don't re-fail on every
      // dispatch. runAndCacheLandmarks doesn't reach the cache write on
      // throw, so do it explicitly here.
      const active = cacheManager.get(sourceId);
      if (active) {
        active.landmarks = null;
        active.landmarksAttempted = true;
      }
    }
  }
  // Apply boost. Identity (returns input by reference) when faceAwareEnabled=false
  // OR cache.landmarks=null (no face detected, or detection skipped, or it failed).
  const boosted = applyFaceBoost(smoothed, cache.landmarks, faceAwareEnabled);

  // Step 2: optional saturation adjustment (HSL). amount=0 short-circuits
  // inside saturationAdjust to return the input ImageData unchanged, so
  // v1 defaults produce v1-bit-identical output.
  const adjusted = saturationAdjust(boosted, msg.saturation ?? 0);

  // Step 3: optional aspect-ratio center crop. Undefined ratio preserves
  // source dims (v1 default).
  const cropped =
    msg.aspectRatio !== undefined ? centerCrop(adjusted, msg.aspectRatio) : adjusted;

  // Step 3a: optional silhouette mask. Two routes:
  //   - Fast (or undefined) → naive corner-sample on the CROPPED image
  //     (per v3 plan post-crop fix). This is the v3 path; identical
  //     behavior when silhouetteQuality is absent.
  //   - Smart → ML segmentation via U2-NetP on the SMOOTHED source, then
  //     crop the mask alongside the image so dims match `cropped`.
  //
  // R12 invariant gate: when `silhouetteEnabled === false` we never call
  // into the ML path at all — no `getOrtSession`, no fetch, no model
  // load. Same gating principle U6 applies for face landmarks.
  const silhouetteEnabled = msg.silhouetteEnabled === true;
  const silhouetteTolerance = msg.silhouetteTolerance ?? DEFAULT_SILHOUETTE_TOLERANCE;
  const silhouetteQuality = msg.silhouetteQuality ?? "fast";
  let sourceMask: ImageData | null = null;
  if (silhouetteEnabled) {
    if (silhouetteQuality === "smart") {
      // Smart: try ML, fall back to naive on failure (with one-shot
      // ml-error emit). Cache reuse across dispatches: if a mask for
      // this sourceId is already cached (from an earlier Smart dispatch),
      // skip the inference and re-use it. The mask is computed on the
      // smoothed (or just-rasterized) source, so it doesn't depend on
      // the per-dispatch saturation / posterize / outline knobs.
      const cached = cache.segmentationMask;
      if (cached && cached.width === smoothed.width && cached.height === smoothed.height) {
        sourceMask = cached;
      } else {
        emitMLStatus("segmentation", "loading");
        try {
          const mlMask = await runAndCacheSegmentation(smoothed, sourceId, cacheManager);
          emitMLStatus("segmentation", "ready");
          sourceMask = mlMask;
        } catch (err) {
          emitMLStatus("segmentation", "failed");
          emitMLError("segmentation", toMLErrorCode(err));
          // Fall back to naive corner-sample on the cropped image.
          sourceMask = buildMask(
            cropped,
            sampleBackgroundColor(cropped),
            silhouetteTolerance,
          );
        }
      }
      // The ML mask is at smoothed (pre-crop) dims; crop it to match
      // `cropped` if a crop happened. cropMaskToImage handles both cases.
      if (sourceMask && (sourceMask.width !== cropped.width || sourceMask.height !== cropped.height)) {
        sourceMask = cropMaskToMatch(sourceMask, smoothed.width, smoothed.height, cropped);
      }
    } else {
      // Fast (v3 path): naive corner-sample post-crop.
      sourceMask = buildMask(cropped, sampleBackgroundColor(cropped), silhouetteTolerance);
    }
  }

  // Step 3b: optional posterization (per-channel band reduction). Runs
  // before downscale so bands survive area-averaging. Identity when
  // bands=undefined (R12 invariant).
  const posterized = posterize(cropped, msg.posterizeBands);

  // Now compute target dimensions from the (possibly cropped) image.
  const { width, height } = computeTargetDims(posterized.width, posterized.height, targetLongEdge);

  // Step 4: area-average downscale (pure JS, no canvas resize).
  const downscaled = areaAverageDownscale(posterized, width, height);

  // Step 4a: downscale the silhouette mask alongside the image (nearest-
  // neighbor preserves binary semantics).
  const downscaledMask = sourceMask ? downscaleMask(sourceMask, width, height) : null;

  // Step 5: quantize. Auto mode (no fixedPalette, no brandColors) is the
  // v1 path. Fixed-palette + brand-colors variations layer in via options.
  // v3: paletteSize is now caller-controlled (default 16 preserves v2).
  // v4: outline runs AFTER quantize (see step 6) so the configured outline
  // color is not absorbed into the palette.
  const quantized = quantizePalette(downscaled, {
    paletteSize: msg.paletteSize ?? DEFAULT_PALETTE_SIZE,
    fixedPalette: msg.fixedPalette,
    brandColors: msg.brandColors,
  });

  // Step 6: optional outline overlay (XDoG + dilate + colored fill) at
  // output resolution so 1px lines are crisp. v4 moves this from pre- to
  // post-quantize: the outline color paints onto already-quantized pixels
  // and survives to the output exactly as configured (no palette
  // absorption). Disabled short-circuits to identity inside applyOutline.
  const outlined = applyOutline(quantized, {
    enabled: msg.outlineEnabled ?? false,
    width: msg.outlineWidth ?? 1,
    color: (msg.outlineColor as [number, number, number] | undefined) ?? DEFAULT_OUTLINE_COLOR,
  });

  // Step 6a: apply silhouette mask if active. Zeros alpha where the mask
  // says background; preserves alpha=255 elsewhere. The quantizer's
  // alpha=255 force is harmless because applyMask runs after.
  const masked = downscaledMask ? applyMask(outlined, downscaledMask) : outlined;

  // Step 7: chunky pixel render. chunkSize=1 short-circuits to identity.
  const final = chunkify(masked, msg.chunkSize ?? 1);

  const result: ProcessResult = {
    type: "result",
    jobId,
    width: final.width,
    height: final.height,
    pixels: final.data,
  };
  self.postMessage(result, [final.data.buffer]);
}

/**
 * Center-crop a binary mask to match the dims of an already-cropped image.
 *
 * The ML mask comes back at the pre-crop source dims (smoothed). When the
 * worker has applied a center crop to the image, the mask must be cropped
 * the same way so `applyMask` sees matching dims. This re-derives the same
 * x/y offsets centerCrop uses (centered, integer-floored) so both crops
 * sample the same region.
 *
 * Nearest-neighbor copy of alpha only — R/G/B in the mask are unused.
 */
function cropMaskToMatch(
  mask: ImageData,
  srcW: number,
  srcH: number,
  croppedImage: ImageData,
): ImageData {
  if (mask.width !== srcW || mask.height !== srcH) {
    // Mask wasn't at source dims — bail out, return as-is. Shouldn't
    // happen on the Smart path, but defensive: applyMask will catch a
    // dim mismatch with a typed error if we hand back a wrong mask.
    return mask;
  }
  const cropW = croppedImage.width;
  const cropH = croppedImage.height;
  if (cropW === srcW && cropH === srcH) {
    return mask;
  }
  const xOffset = Math.floor((srcW - cropW) / 2);
  const yOffset = Math.floor((srcH - cropH) / 2);
  const dst = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRow = ((y + yOffset) * srcW + xOffset) * 4;
    const dstRow = y * cropW * 4;
    for (let x = 0; x < cropW; x++) {
      dst[dstRow + x * 4 + 3] = mask.data[srcRow + x * 4 + 3]!;
    }
  }
  return new ImageData(dst, cropW, cropH);
}

export function computeTargetDims(
  sourceWidth: number,
  sourceHeight: number,
  targetLongEdge: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const longEdge = Math.max(sourceWidth, sourceHeight);
  if (targetLongEdge >= longEdge) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = targetLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function postError(jobId: number, code: WorkerErrorMessage["code"], message: string): void {
  const err: WorkerErrorMessage = { type: "error", jobId, code, message };
  self.postMessage(err);
}
