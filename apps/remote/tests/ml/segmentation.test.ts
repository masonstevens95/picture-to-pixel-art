import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCreateTensorForTests,
  __resetPrepareInputForTests,
  __resetSegmentationForTests,
  __setCreateTensorForTests,
  __setPrepareInputForTests,
  postProcessMask,
  runAndCacheSegmentation,
  runSegmentation,
  U2NETP_DESCRIPTOR,
  U2NETP_INPUT_SIZE,
} from "../../src/ml/segmentation";
import { __resetRuntimeForTests } from "../../src/ml/runtime";
import { MLRuntimeError } from "../../src/ml/types";
import { SourceCacheManager } from "../../src/pipeline/sourceCache";

/**
 * Segmentation tests run in jsdom. jsdom does NOT polyfill OffscreenCanvas,
 * so the production `prepareInput` fails there. Tests inject a stub via
 * `__setPrepareInputForTests` to bypass the resize step entirely; the
 * inference + post-processing path is what we want to exercise.
 *
 * `getOrtSession` is mocked at the module level so we never hit the real
 * `onnxruntime-web` import (tests run on Node, where the WASM artifact
 * resolution would fail and the goal is unit-level coverage anyway).
 */

vi.mock("../../src/ml/runtime", async () => {
  const actual = await vi.importActual<typeof import("../../src/ml/runtime")>(
    "../../src/ml/runtime",
  );
  return {
    ...actual,
    getOrtSession: vi.fn(),
  };
});

import { getOrtSession } from "../../src/ml/runtime";

const getOrtSessionMock = getOrtSession as unknown as ReturnType<typeof vi.fn>;

interface FakeTensor {
  data: Float32Array;
  dims: readonly number[];
}

interface FakeSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: ReturnType<typeof vi.fn>;
}

function makeSession(
  output: Float32Array,
  options: { inputName?: string; outputName?: string } = {},
): FakeSession {
  return {
    inputNames: [options.inputName ?? "input"],
    outputNames: [options.outputName ?? "output"],
    run: vi.fn(async (_feeds: Record<string, FakeTensor>) => ({
      [options.outputName ?? "output"]: {
        data: output,
        dims: [1, 1, U2NETP_INPUT_SIZE, U2NETP_INPUT_SIZE],
      },
    })),
  };
}

function makeImageData(w: number, h: number): ImageData {
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

function makeProbabilityMap(value: number): Float32Array {
  const out = new Float32Array(U2NETP_INPUT_SIZE * U2NETP_INPUT_SIZE);
  out.fill(value);
  return out;
}

beforeEach(() => {
  // Stub `prepareInput` so jsdom-missing OffscreenCanvas doesn't blow up.
  // The exact tensor contents don't matter for these tests — the mocked
  // session ignores the input.
  __setPrepareInputForTests(() =>
    new Float32Array(3 * U2NETP_INPUT_SIZE * U2NETP_INPUT_SIZE),
  );
  // Stub `createTensor` so the production code's lazy ORT import never
  // fires in jsdom (Node can't load the WASM artifacts and `import` would
  // throw before we got to `session.run`).
  __setCreateTensorForTests(async (data, dims) => ({ data, dims }));
});

afterEach(() => {
  __resetPrepareInputForTests();
  __resetCreateTensorForTests();
  __resetSegmentationForTests();
  __resetRuntimeForTests();
  getOrtSessionMock.mockReset();
  vi.restoreAllMocks();
});

describe("postProcessMask — pure function", () => {
  it("threshold=0.5: probs above the threshold map to alpha=255, below to alpha=0", () => {
    const probs = new Float32Array(U2NETP_INPUT_SIZE * U2NETP_INPUT_SIZE);
    // Top-left corner: high probability → foreground.
    probs[0] = 0.9;
    // Some other pixel: below threshold → background.
    probs[1] = 0.1;

    const mask = postProcessMask(probs, U2NETP_INPUT_SIZE, U2NETP_INPUT_SIZE, U2NETP_INPUT_SIZE);
    // Alpha at (0,0) should be 255; alpha at (1,0) should be 0.
    expect(mask.data[3]).toBe(255);
    expect(mask.data[4 + 3]).toBe(0);
  });

  it("upscales nearest-neighbor to source dims", () => {
    const probs = makeProbabilityMap(0.0);
    // Mark the top-left input pixel as foreground; expect it to fill the
    // top-left REGION of the upscaled mask.
    probs[0] = 1.0;
    const mask = postProcessMask(probs, U2NETP_INPUT_SIZE, 640, 640);
    expect(mask.width).toBe(640);
    expect(mask.height).toBe(640);
    // (0, 0) maps back to source (0, 0) — should be foreground.
    expect(mask.data[3]).toBe(255);
  });

  it("R/G/B channels are zero — only alpha encodes the mask", () => {
    const probs = makeProbabilityMap(1.0);
    const mask = postProcessMask(probs, U2NETP_INPUT_SIZE, 8, 8);
    for (let i = 0; i < mask.data.length; i += 4) {
      expect(mask.data[i]).toBe(0);
      expect(mask.data[i + 1]).toBe(0);
      expect(mask.data[i + 2]).toBe(0);
      expect(mask.data[i + 3]).toBe(255);
    }
  });

  it("rejects mismatched probability-map size with a typed MLRuntimeError", () => {
    expect(() => postProcessMask(new Float32Array(10), U2NETP_INPUT_SIZE, 16, 16)).toThrow(
      MLRuntimeError,
    );
  });

  it("rejects non-positive target dims with a typed MLRuntimeError", () => {
    const probs = makeProbabilityMap(0.5);
    expect(() => postProcessMask(probs, U2NETP_INPUT_SIZE, 0, 16)).toThrow(MLRuntimeError);
    expect(() => postProcessMask(probs, U2NETP_INPUT_SIZE, 16, -1)).toThrow(MLRuntimeError);
  });
});

describe("runSegmentation — happy paths (mocked session)", () => {
  it("all-zero probability map → all-background mask (alpha=0 everywhere)", async () => {
    const session = makeSession(makeProbabilityMap(0));
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mask = await runSegmentation(makeImageData(32, 32));
    for (let i = 3; i < mask.data.length; i += 4) {
      expect(mask.data[i]).toBe(0);
    }
  });

  it("all-one probability map → all-foreground mask (alpha=255 everywhere)", async () => {
    const session = makeSession(makeProbabilityMap(1));
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mask = await runSegmentation(makeImageData(32, 32));
    for (let i = 3; i < mask.data.length; i += 4) {
      expect(mask.data[i]).toBe(255);
    }
  });

  it("source dims preserved end-to-end (mask matches source, not 320×320)", async () => {
    const session = makeSession(makeProbabilityMap(0.5));
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mask = await runSegmentation(makeImageData(123, 77));
    expect(mask.width).toBe(123);
    expect(mask.height).toBe(77);
  });

  it("uses session.inputNames[0] / outputNames[0] (works with non-default tensor names)", async () => {
    const session = makeSession(makeProbabilityMap(0.6), {
      inputName: "input.1",
      outputName: "1959",
    });
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mask = await runSegmentation(makeImageData(16, 16));
    // Verify session.run was actually called with the renamed input.
    expect(session.run).toHaveBeenCalledTimes(1);
    const feeds = session.run.mock.calls[0]![0] as Record<string, FakeTensor>;
    expect("input.1" in feeds).toBe(true);
    // And the resulting mask is well-formed.
    expect(mask.width).toBe(16);
    expect(mask.height).toBe(16);
  });
});

describe("runSegmentation — error paths", () => {
  it("getOrtSession rejecting with MLRuntimeError propagates the typed error", async () => {
    const err = new MLRuntimeError("model_load_failed", "boom", {
      modelUrl: U2NETP_DESCRIPTOR.url,
    });
    getOrtSessionMock.mockRejectedValue(err);

    await expect(runSegmentation(makeImageData(8, 8))).rejects.toBeInstanceOf(MLRuntimeError);
    await expect(runSegmentation(makeImageData(8, 8))).rejects.toMatchObject({
      code: "model_load_failed",
    });
  });

  it("session.run throwing surfaces MLRuntimeError(inference_failed)", async () => {
    const session: FakeSession = {
      inputNames: ["input"],
      outputNames: ["output"],
      run: vi.fn(async () => {
        throw new Error("ORT exploded");
      }),
    };
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    await expect(runSegmentation(makeImageData(8, 8))).rejects.toMatchObject({
      code: "inference_failed",
    });
  });

  it("missing output tensor surfaces MLRuntimeError(inference_failed)", async () => {
    const session: FakeSession = {
      inputNames: ["input"],
      outputNames: ["output"],
      run: vi.fn(async () => ({})),
    };
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    await expect(runSegmentation(makeImageData(8, 8))).rejects.toMatchObject({
      code: "inference_failed",
    });
  });

  it("non-positive source dims rejected before any ORT work", async () => {
    await expect(runSegmentation(makeImageData(0, 8))).rejects.toMatchObject({
      code: "inference_failed",
    });
    // getOrtSession should not have been called for the bail-out path.
    expect(getOrtSessionMock).not.toHaveBeenCalled();
  });
});

describe("runAndCacheSegmentation — write-back guard (cancellation)", () => {
  it("writes the mask into the active cache slot when the sourceId still matches", async () => {
    const session = makeSession(makeProbabilityMap(0.7));
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mgr = new SourceCacheManager();
    mgr.getOrInit("A");

    const mask = await runAndCacheSegmentation(makeImageData(8, 8), "A", mgr);
    const cache = mgr.get("A");
    expect(cache).not.toBeNull();
    expect(cache!.segmentationMask).toBe(mask);
  });

  it("does NOT poison a different active cache when the inflight sourceId became stale", async () => {
    // Stage: caller starts segmentation for sourceId 'A'. Mid-inference the
    // user drops a new image and the cache evicts 'A' for 'B'. When the
    // mask resolves, write-back must NOT mutate B's segmentationMask slot.
    let resolveRun: ((value: Record<string, FakeTensor>) => void) | null = null;
    const session: FakeSession = {
      inputNames: ["input"],
      outputNames: ["output"],
      run: vi.fn(
        () =>
          new Promise<Record<string, FakeTensor>>((resolve) => {
            resolveRun = resolve;
          }),
      ),
    };
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mgr = new SourceCacheManager();
    mgr.getOrInit("A");
    const promise = runAndCacheSegmentation(makeImageData(8, 8), "A", mgr);

    // Drain microtasks so runSegmentation reaches the session.run call.
    // getOrtSession + createTensor are async; without this flush, resolveRun
    // is still null when we reach the next assertion.
    for (let i = 0; i < 10 && !resolveRun; i++) {
      await Promise.resolve();
    }
    expect(resolveRun).not.toBeNull();

    // Simulate the cache being invalidated for a new source mid-inference.
    mgr.getOrInit("B");

    // Now release the inference with a known probability map.
    resolveRun!({
      output: {
        data: makeProbabilityMap(0.7),
        dims: [1, 1, U2NETP_INPUT_SIZE, U2NETP_INPUT_SIZE],
      },
    });
    await promise;

    // B's slot must still be null — the stale 'A' result was discarded.
    const cacheB = mgr.get("B");
    expect(cacheB).not.toBeNull();
    expect(cacheB!.segmentationMask).toBeNull();
    // And A is gone (evicted), so no write happened there either.
    expect(mgr.get("A")).toBeNull();
  });

  it("returns the mask to the caller even when the write-back is skipped (caller uses it for the in-flight dispatch)", async () => {
    const session = makeSession(makeProbabilityMap(0.7));
    getOrtSessionMock.mockResolvedValue({ descriptor: U2NETP_DESCRIPTOR, session });

    const mgr = new SourceCacheManager();
    // Cache is at 'B'; we run for 'A' which the cache won't accept.
    mgr.getOrInit("B");
    const mask = await runAndCacheSegmentation(makeImageData(8, 8), "A", mgr);
    expect(mask.width).toBe(8);
    expect(mask.height).toBe(8);
    // Cache 'B' wasn't poisoned.
    expect(mgr.get("B")!.segmentationMask).toBeNull();
  });
});
