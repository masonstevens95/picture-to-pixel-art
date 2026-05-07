/**
 * U2-NetP segmentation (U5).
 *
 * Lazy-loads U2-NetP via the U1 ORT runtime, runs inference, and returns a
 * binary alpha mask (alpha=0 background, alpha=255 foreground). The worker
 * (U5 wiring in `pixelArtWorker.ts`) calls this on the Smart silhouette
 * path; the Fast path keeps using the v3 naive corner-sample.
 *
 * Why this layer is split into `prepareInput` + `runSegmentation`:
 *   jsdom (the unit-test environment) does NOT polyfill `OffscreenCanvas`.
 *   The 320×320 resize step needs OffscreenCanvas-or-equivalent. Splitting
 *   the pure-tensor / browser-canvas concerns lets the test suite stub the
 *   `prepareInput` step (or hand a pre-built tensor in) while still
 *   exercising the inference + post-processing path end-to-end.
 *
 *   Production code path: `runSegmentation(source)` calls `prepareInput`
 *   internally, which runs in the worker (which DOES have OffscreenCanvas).
 *
 * U2-NetP input contract:
 *   - Shape: [1, 3, 320, 320] NCHW Float32
 *   - Normalization: ImageNet mean [0.485, 0.456, 0.406] / std [0.229,
 *     0.224, 0.225] (per the BritishWerewolf/U-2-Netp model card and the
 *     upstream Xuebin Qin reference impl).
 *   - Output: [1, 1, 320, 320] saliency / probability map in [0, 1] (the
 *     ONNX graph applies sigmoid).
 *
 * Post-processing: threshold at 0.5 → binary, then nearest-neighbor upscale
 * back to source dims (preserves binary semantics — bilinear or area would
 * produce gray edges that violate the alpha=0/255 contract downstream).
 *
 * Cancellation note: `runSegmentation` itself doesn't track sourceId. The
 * worker layer wraps the call in `runAndCacheSegmentation` (in this file)
 * to guard write-back against the active SourceCacheManager — if the user
 * dropped a new image mid-inference, the result is dropped on return
 * rather than poisoning the now-stale cache slot. ORT's session.run isn't
 * cleanly abortable, so we accept the wasted compute and just discard.
 */

import { getOrtSession } from "./runtime";
import { MLRuntimeError, type ModelDescriptor } from "./types";
import { SourceCacheManager } from "../pipeline/sourceCache";

/**
 * U2-NetP model URL.
 *
 * BritishWerewolf/U-2-Netp on HuggingFace publishes a static-shape ONNX
 * export of U2-NetP that ORT-Web can load directly. The `resolve/main/`
 * path is the raw-file endpoint; HF serves it with permissive CORS so
 * the browser cache layer can read the bytes without an opaque response.
 *
 * If this URL ever breaks, swap in either:
 *   1. A self-hosted mirror in our deploy bucket (preferred long-term —
 *      removes the third-party uptime dependency).
 *   2. The original Xuebin Qin export at https://github.com/xuebinqin/U-2-Net
 *      (PyTorch checkpoint; would need a one-off ONNX export step).
 */
export const U2NETP_MODEL_URL =
  "https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/main/u2netp.onnx";

/** U2-NetP descriptor. Consumed by the U1 runtime via `getOrtSession`. */
export const U2NETP_DESCRIPTOR: ModelDescriptor = {
  id: "u2netp",
  url: U2NETP_MODEL_URL,
  inputShape: [1, 3, 320, 320],
};

/** Inference dims (square model input). */
export const U2NETP_INPUT_SIZE = 320;

/** ImageNet normalization constants. Read in `prepareInput`. */
const IMAGENET_MEAN: readonly [number, number, number] = [0.485, 0.456, 0.406];
const IMAGENET_STD: readonly [number, number, number] = [0.229, 0.224, 0.225];

/** Threshold for binarizing the saliency map. 0.5 is the U2-Net convention. */
const MASK_THRESHOLD = 0.5;

/**
 * Minimal subset of `ort.InferenceSession` we touch. Typed locally so the
 * `unknown` on `InferenceSessionWrapper.session` narrows here without
 * pulling `onnxruntime-web` types into the bundle.
 */
interface OrtTensorLike {
  readonly data: Float32Array;
  readonly dims: readonly number[];
}

interface OrtSessionLike {
  run(feeds: Record<string, OrtTensorLike>): Promise<Record<string, OrtTensorLike>>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
}

/**
 * Resize `source` to 320×320 RGB, normalize to ImageNet stats, and pack
 * into an NCHW Float32 of shape [1, 3, 320, 320].
 *
 * Browser-only: relies on `OffscreenCanvas`. In tests, prefer to either
 * (a) inject a pre-built tensor into `runSegmentationWithSession`, or
 * (b) replace this function via `__setPrepareInputForTests` below.
 */
export function prepareInput(source: ImageData): Float32Array {
  const size = U2NETP_INPUT_SIZE;
  const pixels = resizeToSquare(source, size);

  // Pack RGB planes contiguously: [R-plane (size*size), G-plane, B-plane].
  // U2-NetP / most PyTorch exports want NCHW, not NHWC.
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0, p = 0; p < plane; p++, i += 4) {
    const r = pixels[i]! / 255;
    const g = pixels[i + 1]! / 255;
    const b = pixels[i + 2]! / 255;
    out[p] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    out[p + plane] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    out[p + 2 * plane] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return out;
}

/**
 * Resize `source` ImageData to a `size × size` RGBA buffer using
 * OffscreenCanvas's drawImage scaling. The canvas's default 2D smoothing
 * is acceptable for ML preprocessing — U2-NetP was trained on bilinear-
 * resized inputs.
 *
 * Throws `MLRuntimeError('inference_failed')` if OffscreenCanvas is
 * unavailable (browser too old, jsdom test env). Tests should bypass
 * `prepareInput` rather than relying on a polyfill here.
 */
function resizeToSquare(source: ImageData, size: number): Uint8ClampedArray {
  const OffCanvasCtor = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas })
    .OffscreenCanvas;
  if (!OffCanvasCtor) {
    throw new MLRuntimeError(
      "inference_failed",
      "OffscreenCanvas unavailable; segmentation preprocessing cannot run",
    );
  }

  // Draw source at native size, then scale-blit into a `size × size`
  // canvas. Two-stage so the source-side `putImageData` doesn't need to
  // match the destination dims.
  const srcCanvas = new OffCanvasCtor(source.width, source.height);
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) {
    throw new MLRuntimeError(
      "inference_failed",
      "Could not acquire 2D context for source canvas",
    );
  }
  srcCtx.putImageData(source, 0, 0);

  const dstCanvas = new OffCanvasCtor(size, size);
  const dstCtx = dstCanvas.getContext("2d");
  if (!dstCtx) {
    throw new MLRuntimeError(
      "inference_failed",
      "Could not acquire 2D context for resized canvas",
    );
  }
  dstCtx.drawImage(
    srcCanvas as unknown as CanvasImageSource,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    size,
    size,
  );
  return dstCtx.getImageData(0, 0, size, size).data;
}

/**
 * Threshold a [0, 1] saliency map → binary; nearest-neighbor upscale to
 * source dims; pack into ImageData where alpha encodes the mask.
 *
 * Pure function — exported so tests can exercise it without ORT. R/G/B
 * channels are deliberately zeroed; downstream only reads alpha.
 */
export function postProcessMask(
  probability: Float32Array,
  inputSize: number,
  targetW: number,
  targetH: number,
): ImageData {
  if (probability.length !== inputSize * inputSize) {
    throw new MLRuntimeError(
      "inference_failed",
      `Probability map size mismatch: got ${probability.length}, expected ${inputSize * inputSize}`,
    );
  }
  if (targetW <= 0 || targetH <= 0) {
    throw new MLRuntimeError(
      "inference_failed",
      `Target dims must be positive, got ${targetW}x${targetH}`,
    );
  }

  // Binarize once into a small Uint8Array, then upscale. Doing the
  // threshold in 320×320-space first keeps the upscale loop cheap and
  // avoids per-pixel Float32 reads at output dims.
  const binary = new Uint8Array(inputSize * inputSize);
  for (let i = 0; i < binary.length; i++) {
    binary[i] = probability[i]! >= MASK_THRESHOLD ? 255 : 0;
  }

  const dst = new Uint8ClampedArray(targetW * targetH * 4);
  // Nearest-neighbor: each output pixel samples the binary map at its
  // mapped source coord. Same arithmetic as silhouette.downscaleMask.
  for (let dy = 0; dy < targetH; dy++) {
    const sy = Math.min(inputSize - 1, Math.floor((dy * inputSize) / targetH));
    for (let dx = 0; dx < targetW; dx++) {
      const sx = Math.min(inputSize - 1, Math.floor((dx * inputSize) / targetW));
      const src = sy * inputSize + sx;
      const off = (dy * targetW + dx) * 4;
      // R/G/B left at 0 — only alpha is read downstream.
      dst[off + 3] = binary[src]!;
    }
  }
  return new ImageData(dst, targetW, targetH);
}

/**
 * Test seam: replace `prepareInput` for the duration of a test so jsdom
 * doesn't need OffscreenCanvas. Tests call `__setPrepareInputForTests(stub)`
 * before invoking `runSegmentation`, then `__resetPrepareInputForTests()`
 * to restore the production implementation.
 *
 * Not exported via the package's public surface — only the worker calls
 * `runSegmentation`, and only tests touch the override hooks.
 */
let prepareInputImpl: (source: ImageData) => Float32Array = prepareInput;
export function __setPrepareInputForTests(impl: (source: ImageData) => Float32Array): void {
  prepareInputImpl = impl;
}
export function __resetPrepareInputForTests(): void {
  prepareInputImpl = prepareInput;
}

/**
 * Run U2-NetP on `source` and return a binary alpha mask sized to the
 * source dims.
 *
 * Failure modes (all surface as `MLRuntimeError`):
 *   - `model_load_failed`: ORT session failed to initialize (network, CORS,
 *     truncated cache that re-fetch couldn't fix). Worker catches and
 *     falls back to naive corner-sample.
 *   - `inference_failed`: session.run threw, output shape wrong, or canvas
 *     unavailable for preprocessing.
 */
export async function runSegmentation(source: ImageData): Promise<ImageData> {
  if (source.width <= 0 || source.height <= 0) {
    throw new MLRuntimeError(
      "inference_failed",
      `Source dims must be positive, got ${source.width}x${source.height}`,
    );
  }

  // Phase 1: ORT session (lazy-loaded + memoised inside getOrtSession).
  // Errors here are typed `MLRuntimeError` already; let them propagate.
  const wrapper = await getOrtSession(U2NETP_DESCRIPTOR);
  const session = wrapper.session as OrtSessionLike;

  // Phase 2: prepare input tensor. May throw if OffscreenCanvas is missing
  // (which happens in jsdom; tests inject a stub via __setPrepareInputForTests).
  const tensorData = prepareInputImpl(source);

  // Phase 3: run inference. The input/output names come from the ONNX
  // graph; we don't pin them statically because BritishWerewolf's export
  // and the upstream PyTorch export disagree (`input.1` vs `input`). Use
  // session.inputNames[0] / outputNames[0] so we work with either.
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  if (!inputName || !outputName) {
    throw new MLRuntimeError(
      "inference_failed",
      "U2-NetP session missing input or output names",
    );
  }

  const tensor = await createTensor(tensorData, [
    1,
    3,
    U2NETP_INPUT_SIZE,
    U2NETP_INPUT_SIZE,
  ]);

  let results: Record<string, OrtTensorLike>;
  try {
    results = await session.run({ [inputName]: tensor });
  } catch (cause) {
    throw new MLRuntimeError("inference_failed", "U2-NetP session.run threw", {
      cause,
    });
  }

  const probTensor = results[outputName];
  if (!probTensor || !(probTensor.data instanceof Float32Array)) {
    throw new MLRuntimeError(
      "inference_failed",
      "U2-NetP output missing or wrong dtype",
    );
  }

  // Phase 4: threshold + nearest-neighbor upscale to source dims.
  return postProcessMask(
    probTensor.data,
    U2NETP_INPUT_SIZE,
    source.width,
    source.height,
  );
}

/**
 * Lazy-import ORT to grab the `Tensor` constructor on demand.
 *
 * The runtime layer (U1) keeps the heavy `onnxruntime-web` import behind a
 * dynamic import; we re-use the same pattern here rather than re-importing
 * at module load. Memoised so repeat calls are free.
 */
type OrtTensorCtor = new (
  type: "float32",
  data: Float32Array,
  dims: readonly number[],
) => OrtTensorLike;
let tensorCtorPromise: Promise<OrtTensorCtor> | null = null;

/**
 * Test seam: replace the tensor factory so jsdom-based tests don't trip
 * the ORT lazy-import. Production code never touches this.
 */
let createTensorImpl: (
  data: Float32Array,
  dims: readonly number[],
) => Promise<OrtTensorLike> = createTensorViaOrt;

export function __setCreateTensorForTests(
  impl: (data: Float32Array, dims: readonly number[]) => Promise<OrtTensorLike>,
): void {
  createTensorImpl = impl;
}
export function __resetCreateTensorForTests(): void {
  createTensorImpl = createTensorViaOrt;
}

async function createTensorViaOrt(
  data: Float32Array,
  dims: readonly number[],
): Promise<OrtTensorLike> {
  if (!tensorCtorPromise) {
    tensorCtorPromise = (async () => {
      const ort = (await import("onnxruntime-web/wasm")) as unknown as {
        Tensor: OrtTensorCtor;
      };
      return ort.Tensor;
    })();
  }
  const Tensor = await tensorCtorPromise;
  return new Tensor("float32", data, dims);
}

async function createTensor(
  data: Float32Array,
  dims: readonly number[],
): Promise<OrtTensorLike> {
  return createTensorImpl(data, dims);
}

/**
 * Worker-facing wrapper: run segmentation, then guard write-back against
 * the active source-cache.
 *
 * If the user dropped a new image mid-inference, the source-cache will
 * have moved on to a new sourceId. We discard the result rather than
 * mutate the new cache entry's `segmentationMask` slot with a mask
 * computed from a different image. The caller (worker) still uses the
 * returned mask for the in-flight dispatch — discarding only blocks
 * cache POLLUTION, not single-job correctness.
 */
export async function runAndCacheSegmentation(
  source: ImageData,
  sourceId: string,
  cacheManager: SourceCacheManager,
): Promise<ImageData> {
  const mask = await runSegmentation(source);
  const active = cacheManager.get(sourceId);
  if (active) {
    active.segmentationMask = mask;
  }
  // else: stale dispatch, cache moved on. Drop write-back; caller still
  // applies this mask to its own in-flight result.
  return mask;
}

/** Test-only: reset the lazy Tensor-constructor handle and prepare-input override. */
export function __resetSegmentationForTests(): void {
  tensorCtorPromise = null;
  prepareInputImpl = prepareInput;
  createTensorImpl = createTensorViaOrt;
}
