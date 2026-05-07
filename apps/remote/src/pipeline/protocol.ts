/**
 * Wire protocol between PixelArtApp and the pixel-art worker.
 *
 * Three message types — no explicit abort. Cancellation works by jobId:
 * the hook ignores any result whose jobId doesn't match its latest dispatch,
 * which collapses superseded results without a bidirectional abort handshake.
 *
 * (Earlier drafts had an AbortRequest type. It was removed during planning
 * — debounce + jobId filtering on the receive side handles the slider drag
 * race without it.)
 */

export interface ProcessRequest {
  readonly type: "process";
  readonly jobId: number;
  readonly bitmap: ImageBitmap;
  readonly targetLongEdge: number;
  /**
   * v4 source identity. Required for every request — opaque string minted
   * on the main thread (UUID per file load). The worker keys its in-process
   * source cache (`SourceCacheManager`) on this id; equal id means same
   * source, different id triggers cache eviction. No content hashing — the
   * main thread already knows when the source file changed.
   */
  readonly sourceId: string;
  /**
   * v2 optional fields. All have v1-equivalent defaults: absence reproduces
   * v1 behavior exactly. The worker must read each as `?? <v1-default>` so
   * the protocol stays forward-compatible.
   */
  readonly saturation?: number; // -1..+1, default 0 (no transform)
  /** Width/height ratio. Undefined preserves source aspect (v1 default). */
  readonly aspectRatio?: number;
  /**
   * When supplied, the worker uses this palette directly instead of running
   * Wu over the source. Used by Curated and Custom palette modes. Undefined
   * is the v1 Auto path.
   */
  readonly fixedPalette?: readonly (readonly [number, number, number])[];
  /**
   * Optional brand-color anchors. Combine with fixedPalette or with the
   * Auto path; brand colors always take the first N slots of the resulting
   * palette.
   */
  readonly brandColors?: readonly (readonly [number, number, number])[];
  /**
   * v3 outline transform. Disabled / omitted reproduces v2 behavior.
   */
  readonly outlineEnabled?: boolean;
  readonly outlineWidth?: number;
  readonly outlineColor?: readonly [number, number, number];
  /** v3 posterization bands (2-8). Undefined = off. */
  readonly posterizeBands?: number;
  /** v3 silhouette (background-removal) options. Off by default. */
  readonly silhouetteEnabled?: boolean;
  readonly silhouetteTolerance?: number;
  /** v3 chunky pixel size (1-4). Undefined or 1 = no-op. */
  readonly chunkSize?: number;
  /** v3 palette size override. Undefined = v2 default of 16. */
  readonly paletteSize?: number;
  /**
   * v4 cartoon-smoothing strength. Undefined or 'off' is the v3-equivalent
   * no-op path (bilateral stage short-circuits to identity). The worker
   * source-cache keys its bilateral output on this value.
   */
  readonly smoothness?: "off" | "low" | "medium" | "high";
}

export interface ProcessResult {
  readonly type: "result";
  readonly jobId: number;
  readonly width: number;
  readonly height: number;
  /** RGBA pixels, length = width * height * 4. */
  readonly pixels: Uint8ClampedArray;
}

export type WorkerErrorCode =
  | "decode_failed"
  | "invalid_input"
  | "internal_error";

export interface WorkerErrorMessage {
  readonly type: "error";
  readonly jobId: number;
  readonly code: WorkerErrorCode;
  readonly message: string;
}

export type WorkerOutboundMessage = ProcessResult | WorkerErrorMessage;
export type WorkerInboundMessage = ProcessRequest;

// v3 extends to 8 stops — Asset filter needs 48, Environment needs 192.
// Original v1/v2 stops {16, 32, 64, 128, 256} all preserved so the v2
// invariant test still passes byte-identically for those values.
export const VALID_LONG_EDGES = [16, 32, 48, 64, 96, 128, 192, 256] as const;
export type ValidLongEdge = (typeof VALID_LONG_EDGES)[number];

export function isValidLongEdge(value: number): value is ValidLongEdge {
  return (VALID_LONG_EDGES as readonly number[]).includes(value);
}

export function isProcessResult(msg: unknown): msg is ProcessResult {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === "result" &&
    typeof m.jobId === "number" &&
    typeof m.width === "number" &&
    typeof m.height === "number" &&
    m.pixels instanceof Uint8ClampedArray
  );
}

export function isWorkerError(msg: unknown): msg is WorkerErrorMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === "error" && typeof m.jobId === "number" && typeof m.code === "string";
}
