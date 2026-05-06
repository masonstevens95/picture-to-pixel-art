/// <reference lib="webworker" />
import type {
  ProcessRequest,
  ProcessResult,
  WorkerErrorMessage,
  WorkerInboundMessage,
} from "./protocol";
import { centerCrop } from "./crop";
import { areaAverageDownscale } from "./downscale";
import { quantizePalette } from "./quantize";
import { saturationAdjust } from "./saturation";

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

self.addEventListener("message", (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data;
  if (msg?.type === "process") {
    handleProcess(msg).catch((err) => {
      postError(msg.jobId, "internal_error", err instanceof Error ? err.message : String(err));
    });
  }
});

async function handleProcess(msg: ProcessRequest): Promise<void> {
  const { jobId, bitmap, targetLongEdge } = msg;

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

  // Step 2: optional saturation adjustment (HSL). amount=0 short-circuits
  // inside saturationAdjust to return the input ImageData unchanged, so
  // v1 defaults produce v1-bit-identical output.
  const adjusted = saturationAdjust(sourceImageData, msg.saturation ?? 0);

  // Step 3: optional aspect-ratio center crop. Undefined ratio preserves
  // source dims (v1 default).
  const cropped =
    msg.aspectRatio !== undefined ? centerCrop(adjusted, msg.aspectRatio) : adjusted;

  // Now compute target dimensions from the (possibly cropped) image.
  const { width, height } = computeTargetDims(cropped.width, cropped.height, targetLongEdge);

  // Step 4: area-average downscale (pure JS, no canvas resize).
  const downscaled = areaAverageDownscale(cropped, width, height);

  // Step 5: Wu quantization to a 16-color palette.
  const quantized = quantizePalette(downscaled, DEFAULT_PALETTE_SIZE);

  const result: ProcessResult = {
    type: "result",
    jobId,
    width: quantized.width,
    height: quantized.height,
    pixels: quantized.data,
  };
  self.postMessage(result, [quantized.data.buffer]);
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
