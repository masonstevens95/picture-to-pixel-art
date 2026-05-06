/// <reference lib="webworker" />
import type {
  ProcessRequest,
  ProcessResult,
  WorkerErrorMessage,
  WorkerInboundMessage,
} from "./protocol";

/**
 * Worker entrypoint. U3 ships an identity transform — render the source
 * ImageBitmap to an OffscreenCanvas at the target long-edge size and
 * return the resulting pixels via a transferable buffer. U4 replaces the
 * single OffscreenCanvas draw with area-average downscale + image-q Wu
 * quantization; the protocol contract here stays stable across that swap.
 */

declare const self: DedicatedWorkerGlobalScope;

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

  const { width, height } = computeTargetDims(bitmap.width, bitmap.height, targetLongEdge);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
  if (!ctx) {
    postError(jobId, "internal_error", "Could not acquire OffscreenCanvas 2D context");
    bitmap.close();
    return;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);

  // Always close the input ImageBitmap — main thread no longer owns it after
  // the structured-clone transfer, so leaks accumulate across slider drags
  // unless the worker disposes here.
  bitmap.close();

  const result: ProcessResult = {
    type: "result",
    jobId,
    width,
    height,
    pixels: imageData.data,
  };
  self.postMessage(result, [imageData.data.buffer]);
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
    // Don't upscale — return source dimensions when target meets or exceeds source.
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
