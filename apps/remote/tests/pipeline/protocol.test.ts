import { describe, expect, it } from "vitest";
import {
  isFirstRenderEndMessage,
  isFirstRenderStartMessage,
  isMLErrorMessage,
  isMLStatusMessage,
  isProcessResult,
  isValidLongEdge,
  isWorkerError,
  VALID_LONG_EDGES,
} from "../../src/pipeline/protocol";

describe("protocol type guards", () => {
  it("VALID_LONG_EDGES contains the 8 v3 stops including v1's originals", () => {
    expect([...VALID_LONG_EDGES]).toEqual([16, 32, 48, 64, 96, 128, 192, 256]);
    // v1's original stops are still present for the R12 invariant.
    for (const v1Stop of [16, 32, 64, 128, 256]) {
      expect(VALID_LONG_EDGES).toContain(v1Stop as never);
    }
  });

  it("isValidLongEdge accepts all 8 stops and rejects everything else", () => {
    for (const v of VALID_LONG_EDGES) expect(isValidLongEdge(v)).toBe(true);
    expect(isValidLongEdge(0)).toBe(false);
    expect(isValidLongEdge(40)).toBe(false);
    expect(isValidLongEdge(-32)).toBe(false);
    expect(isValidLongEdge(Number.NaN)).toBe(false);
    expect(isValidLongEdge(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("isProcessResult validates shape", () => {
    expect(
      isProcessResult({
        type: "result",
        jobId: 1,
        width: 64,
        height: 48,
        pixels: new Uint8ClampedArray(64 * 48 * 4),
      }),
    ).toBe(true);

    // Missing pixels.
    expect(isProcessResult({ type: "result", jobId: 1, width: 64, height: 48 })).toBe(false);
    // Wrong type.
    expect(isProcessResult({ type: "error", jobId: 1, code: "internal_error", message: "x" })).toBe(
      false,
    );
    // Plain Uint8Array, not Uint8ClampedArray.
    expect(
      isProcessResult({
        type: "result",
        jobId: 1,
        width: 1,
        height: 1,
        pixels: new Uint8Array(4),
      }),
    ).toBe(false);
    expect(isProcessResult(null)).toBe(false);
    expect(isProcessResult("nope")).toBe(false);
  });

  it("isMLStatusMessage validates shape", () => {
    expect(
      isMLStatusMessage({ type: "ml-status", stage: "segmentation", phase: "loading" }),
    ).toBe(true);
    expect(
      isMLStatusMessage({ type: "ml-status", stage: "face-landmarks", phase: "ready" }),
    ).toBe(true);
    expect(isMLStatusMessage({ type: "ml-status", stage: "segmentation" })).toBe(false);
    expect(isMLStatusMessage({ type: "result", stage: "segmentation", phase: "loading" })).toBe(
      false,
    );
    expect(isMLStatusMessage(null)).toBe(false);
  });

  it("isMLErrorMessage validates shape", () => {
    expect(
      isMLErrorMessage({ type: "ml-error", stage: "segmentation", code: "model_load_failed" }),
    ).toBe(true);
    expect(isMLErrorMessage({ type: "ml-error", stage: "segmentation" })).toBe(false);
    expect(
      isMLErrorMessage({ type: "ml-status", stage: "segmentation", code: "model_load_failed" }),
    ).toBe(false);
  });

  it("isFirstRenderStartMessage validates shape", () => {
    expect(
      isFirstRenderStartMessage({ type: "first-render-start", sourceId: "abc" }),
    ).toBe(true);
    expect(isFirstRenderStartMessage({ type: "first-render-start" })).toBe(false);
    expect(isFirstRenderStartMessage({ type: "first-render-end", sourceId: "abc" })).toBe(false);
    expect(isFirstRenderStartMessage(null)).toBe(false);
  });

  it("isFirstRenderEndMessage validates shape", () => {
    expect(isFirstRenderEndMessage({ type: "first-render-end", sourceId: "abc" })).toBe(true);
    expect(isFirstRenderEndMessage({ type: "first-render-end" })).toBe(false);
    expect(isFirstRenderEndMessage({ type: "first-render-start", sourceId: "abc" })).toBe(false);
  });

  it("isWorkerError validates shape", () => {
    expect(
      isWorkerError({ type: "error", jobId: 7, code: "decode_failed", message: "boom" }),
    ).toBe(true);

    expect(isWorkerError({ type: "error", code: "decode_failed", message: "x" })).toBe(false);
    expect(
      isWorkerError({
        type: "result",
        jobId: 1,
        width: 1,
        height: 1,
        pixels: new Uint8ClampedArray(4),
      }),
    ).toBe(false);
    expect(isWorkerError(undefined)).toBe(false);
  });
});
