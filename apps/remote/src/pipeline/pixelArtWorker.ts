/// <reference lib="webworker" />
import type {
  ProcessRequest,
  ProcessResult,
  WorkerErrorMessage,
  WorkerInboundMessage,
} from "./protocol";
import { bilateralFilter } from "./bilateral";
import { centerCrop } from "./crop";
import { areaAverageDownscale } from "./downscale";
import { chunkify } from "./chunky";
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

  // Step 2: optional saturation adjustment (HSL). amount=0 short-circuits
  // inside saturationAdjust to return the input ImageData unchanged, so
  // v1 defaults produce v1-bit-identical output.
  const adjusted = saturationAdjust(smoothed, msg.saturation ?? 0);

  // Step 3: optional aspect-ratio center crop. Undefined ratio preserves
  // source dims (v1 default).
  const cropped =
    msg.aspectRatio !== undefined ? centerCrop(adjusted, msg.aspectRatio) : adjusted;

  // Step 3a: optional silhouette mask — sample corners of the CROPPED image
  // (per v3 plan post-crop fix) so the mask coordinates align with what the
  // user will see. Built at cropped dims; downscaled alongside the main image.
  const silhouetteEnabled = msg.silhouetteEnabled === true;
  const silhouetteTolerance = msg.silhouetteTolerance ?? DEFAULT_SILHOUETTE_TOLERANCE;
  const sourceMask = silhouetteEnabled
    ? buildMask(cropped, sampleBackgroundColor(cropped), silhouetteTolerance)
    : null;

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
