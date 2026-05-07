/**
 * Shared types for the ML runtime layer (U1).
 *
 * These types are the public surface the rest of the v4 pipeline (U5
 * segmentation, U6 face landmarks) consumes. The contract is intentionally
 * minimal:
 *
 *  - `ModelDescriptor` is the static metadata a consumer unit hands to
 *    the runtime — id (logging/cache key), URL (where to fetch the model
 *    file), and the input tensor shape (used by the consumer for warmup
 *    + inference, not by the runtime in U1).
 *
 *  - `InferenceSessionWrapper` is what `getOrtSession` resolves to. It
 *    wraps the raw `ort.InferenceSession` along with the descriptor it
 *    was built from so consumers can assert shape compatibility without
 *    plumbing the descriptor through twice.
 *
 *  - `MLRuntimeError` is the typed error every layer below this surfaces
 *    on failure. The `code` enum lets the UI in U8 distinguish cache vs
 *    network vs model-load vs inference failures and route each to the
 *    right degraded-mode path. Codes are committed in U1 because U5/U6
 *    will consume them; we only ever add new codes, never rename.
 *
 * The `ort.InferenceSession` reference is intentionally typed as `unknown`
 * here so this file does not pull `onnxruntime-web` types into the bundle
 * for any consumer that just touches the descriptor or error types. The
 * runtime module narrows it locally where it matters.
 */

/** Static metadata for a model file. Consumers (U5, U6) own the values. */
export interface ModelDescriptor {
  /** Stable identifier used in logs and as a cache key. */
  readonly id: string;
  /** URL the model `.onnx` file is fetched from. */
  readonly url: string;
  /**
   * Expected input tensor shape. Used by consumers for warmup and to
   * sanity-check inputs before inference. The runtime in U1 does not
   * inspect this — it only stores it on the wrapper so consumers can
   * read it without re-plumbing the descriptor.
   */
  readonly inputShape: readonly number[];
}

/**
 * Wraps an `ort.InferenceSession` plus the descriptor it was created from.
 *
 * Consumers run inference via `session.run(...)`. The descriptor is
 * forwarded so callers can read `inputShape` without holding a separate
 * reference.
 *
 * `session` is `unknown` because the ORT types are pulled in lazily in
 * `runtime.ts`; the consumer narrows it to `ort.InferenceSession` at the
 * inference call site (or via a type assertion local to the consumer).
 */
export interface InferenceSessionWrapper {
  readonly descriptor: ModelDescriptor;
  readonly session: unknown;
}

/** Discriminator codes for `MLRuntimeError`. Stable across U1 → U6. */
export type MLRuntimeErrorCode =
  | "model_fetch_failed"
  | "model_load_failed"
  | "inference_failed"
  | "cors_blocked"
  | "quota_exceeded";

/**
 * Typed error surfaced by the ML runtime + cache layer.
 *
 * Generic `Error` is rejected because U8's degraded-mode UI needs to
 * distinguish "model file couldn't be downloaded" (retry next visit)
 * from "model loaded but threw on inference" (probably driver bug, hide
 * the feature) from "CORS blocked" (deploy/config issue).
 */
export class MLRuntimeError extends Error {
  public readonly code: MLRuntimeErrorCode;
  public readonly modelUrl?: string;

  constructor(
    code: MLRuntimeErrorCode,
    message: string,
    options?: { cause?: unknown; modelUrl?: string },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "MLRuntimeError";
    this.code = code;
    if (options?.modelUrl !== undefined) {
      this.modelUrl = options.modelUrl;
    }
  }
}
