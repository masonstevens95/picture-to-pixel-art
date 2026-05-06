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
   * v2 optional fields. All have v1-equivalent defaults: absence reproduces
   * v1 behavior exactly. The worker must read each as `?? <v1-default>` so
   * the protocol stays forward-compatible.
   */
  readonly saturation?: number; // -1..+1, default 0 (no transform)
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

export const VALID_LONG_EDGES = [16, 32, 64, 128, 256] as const;
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
