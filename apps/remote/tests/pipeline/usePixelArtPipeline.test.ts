import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { usePixelArtPipeline } from "../../src/hooks/usePixelArtPipeline";
import type {
  FirstRenderEndMessage,
  FirstRenderStartMessage,
  MLErrorMessage,
  MLStatusMessage,
  ProcessResult,
  WorkerErrorMessage,
} from "../../src/pipeline/protocol";

/**
 * Hook tests use a hand-rolled MockWorker. The real worker pipeline (with
 * OffscreenCanvas + ImageBitmap) is exercised in browser-mode tests once
 * U3's `*.browser.test.ts` lands; here we focus on the hook's contract:
 * debounce, jobId monotonicity, stale-result discard, and unmount cleanup.
 */

interface QueuedMessage {
  jobId: number;
  bitmap: ImageBitmap;
  targetLongEdge: number;
  sourceId: string;
}

class MockWorker {
  public terminated = false;
  public sent: QueuedMessage[] = [];
  public closedBitmaps: ImageBitmap[] = [];

  private listeners: ((event: MessageEvent<unknown>) => void)[] = [];

  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  postMessage(message: {
    type: string;
    jobId: number;
    bitmap: ImageBitmap;
    targetLongEdge: number;
    sourceId: string;
  }): void {
    if (message.type !== "process") return;
    this.sent.push({
      jobId: message.jobId,
      bitmap: message.bitmap,
      targetLongEdge: message.targetLongEdge,
      sourceId: message.sourceId,
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  emitResult(jobId: number, width = 4, height = 3): void {
    const result: ProcessResult = {
      type: "result",
      jobId,
      width,
      height,
      pixels: new Uint8ClampedArray(width * height * 4),
    };
    this.dispatch(result);
  }

  emitError(jobId: number): void {
    const err: WorkerErrorMessage = {
      type: "error",
      jobId,
      code: "decode_failed",
      message: "boom",
    };
    this.dispatch(err);
  }

  emitMLStatus(stage: MLStatusMessage["stage"], phase: MLStatusMessage["phase"]): void {
    const msg: MLStatusMessage = { type: "ml-status", stage, phase };
    this.dispatch(msg);
  }

  emitMLError(stage: MLErrorMessage["stage"], code: MLErrorMessage["code"]): void {
    const msg: MLErrorMessage = { type: "ml-error", stage, code };
    this.dispatch(msg);
  }

  emitFirstRenderStart(sourceId: string): void {
    const msg: FirstRenderStartMessage = { type: "first-render-start", sourceId };
    this.dispatch(msg);
  }

  emitFirstRenderEnd(sourceId: string): void {
    const msg: FirstRenderEndMessage = { type: "first-render-end", sourceId };
    this.dispatch(msg);
  }

  private dispatch(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    for (const l of this.listeners) l(event);
  }
}

function fakeBitmap(): ImageBitmap {
  let closed = false;
  return {
    width: 100,
    height: 80,
    close() {
      closed = true;
    },
    get __closed() {
      return closed;
    },
  } as unknown as ImageBitmap;
}

describe("usePixelArtPipeline", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("dispatches a single process message after debounce and resolves on result", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    const bmp = fakeBitmap();
    act(() => {
      result.current.process(bmp, 64, { sourceId: "test-source-1" });
    });
    // Before debounce fires, nothing is sent.
    expect(worker.sent.length).toBe(0);
    expect(result.current.state.status).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(worker.sent.length).toBe(1);
    expect(worker.sent[0]?.jobId).toBe(1);
    expect(result.current.state.status).toBe("processing");

    act(() => {
      worker.emitResult(1, 64, 51);
    });
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.result?.width).toBe(64);
    expect(result.current.state.result?.height).toBe(51);
  });

  it("debounce collapses rapid calls to a single dispatch with monotonic jobId", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.process(fakeBitmap(), 32, { sourceId: "test-source-2" });
      }
      vi.advanceTimersByTime(16);
    });

    expect(worker.sent.length).toBe(1);
    expect(worker.sent[0]?.jobId).toBe(1);
    expect(worker.sent[0]?.sourceId).toBe("test-source-2");
  });

  it("ignores results whose jobId is older than the latest dispatched", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    // Two distinct dispatches separated by debounce flushes.
    act(() => {
      result.current.process(fakeBitmap(), 32, { sourceId: "test-source-3" });
      vi.advanceTimersByTime(16);
    });
    act(() => {
      result.current.process(fakeBitmap(), 128, { sourceId: "test-source-3" });
      vi.advanceTimersByTime(16);
    });
    expect(worker.sent.length).toBe(2);
    expect(worker.sent.map((m) => m.jobId)).toEqual([1, 2]);

    // Stale jobId 1 result arrives — must be discarded.
    act(() => {
      worker.emitResult(1, 32, 25);
    });
    expect(result.current.state.status).toBe("processing");
    expect(result.current.state.result).toBeNull();

    // Then the live jobId 2 result arrives.
    act(() => {
      worker.emitResult(2, 128, 102);
    });
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.result?.width).toBe(128);
  });

  it("rejects invalid targetLongEdge at the boundary and closes the bitmap", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    const bmp = fakeBitmap();
    act(() => {
      result.current.process(bmp, 0, { sourceId: "test-source-4" });
      vi.advanceTimersByTime(16);
    });
    expect(worker.sent.length).toBe(0);
    expect((bmp as unknown as { __closed: boolean }).__closed).toBe(true);
    expect(result.current.state.status).toBe("idle");
  });

  it("surfaces worker errors for the latest jobId only", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    act(() => {
      result.current.process(fakeBitmap(), 64, { sourceId: "test-source-5" });
      vi.advanceTimersByTime(16);
      worker.emitError(1);
    });
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error?.code).toBe("decode_failed");
  });

  it("terminates the worker and closes any queued bitmap on unmount", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { unmount, result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    const bmp = fakeBitmap();
    act(() => {
      // Queue a dispatch but don't advance past the debounce — bitmap is
      // still owned by the main thread, must be closed on unmount.
      result.current.process(bmp, 64, { sourceId: "test-source-6" });
    });
    expect(worker.terminated).toBe(false);
    unmount();
    expect(worker.terminated).toBe(true);
    expect((bmp as unknown as { __closed: boolean }).__closed).toBe(true);
  });

  it("U2 addendum: terminate() clears worker state so a fresh worker can dispatch independently", () => {
    // Doc-review flagged that no unit explicitly owns the assertion that
    // worker termination drops in-worker state (including the U2 source
    // cache). Worker termination tears down the entire worker, which
    // implicitly drops everything it held; the observable contract is
    // that a fresh hook instance gets a fresh worker, with a fresh jobId
    // counter, fresh source cache, and no leakage from the old worker.
    vi.useFakeTimers();

    const firstWorker = new MockWorker();
    const firstHook = renderHook(() =>
      usePixelArtPipeline({
        debounceMs: 16,
        workerFactory: () => firstWorker as unknown as Worker,
      }),
    );

    act(() => {
      firstHook.result.current.process(fakeBitmap(), 64, { sourceId: "source-old" });
      vi.advanceTimersByTime(16);
    });
    expect(firstWorker.sent.length).toBe(1);
    expect(firstWorker.sent[0]?.jobId).toBe(1);
    expect(firstWorker.sent[0]?.sourceId).toBe("source-old");

    firstHook.unmount();
    expect(firstWorker.terminated).toBe(true);

    // A second hook (simulating remount) creates a fresh worker. Its jobId
    // counter starts at 1 again, and the fresh worker has its own message
    // ledger — there is no shared state with the terminated worker.
    const secondWorker = new MockWorker();
    expect(secondWorker.sent.length).toBe(0);
    expect(secondWorker.terminated).toBe(false);

    const secondHook = renderHook(() =>
      usePixelArtPipeline({
        debounceMs: 16,
        workerFactory: () => secondWorker as unknown as Worker,
      }),
    );

    act(() => {
      secondHook.result.current.process(fakeBitmap(), 32, { sourceId: "source-new" });
      vi.advanceTimersByTime(16);
    });
    expect(secondWorker.sent.length).toBe(1);
    expect(secondWorker.sent[0]?.jobId).toBe(1); // fresh counter, not 2
    expect(secondWorker.sent[0]?.sourceId).toBe("source-new");
    // The terminated worker received nothing further.
    expect(firstWorker.sent.length).toBe(1);

    secondHook.unmount();
    expect(secondWorker.terminated).toBe(true);
  });

  // ---- U8 status / first-render integration scenarios ----

  it("U8 (Covers F3): ml-status loading -> ready transitions update state.mlStatus per stage", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    expect(result.current.state.mlStatus).toEqual({});

    act(() => {
      worker.emitMLStatus("segmentation", "loading");
    });
    expect(result.current.state.mlStatus.segmentation).toBe("loading");

    act(() => {
      worker.emitMLStatus("segmentation", "ready");
    });
    expect(result.current.state.mlStatus.segmentation).toBe("ready");

    // Independent face-landmarks stage tracking.
    act(() => {
      worker.emitMLStatus("face-landmarks", "loading");
    });
    expect(result.current.state.mlStatus["face-landmarks"]).toBe("loading");
    // Segmentation entry is unchanged.
    expect(result.current.state.mlStatus.segmentation).toBe("ready");
  });

  it("U8 (Covers F5 / AE8): ml-status failed updates state.mlStatus so DegradedModeNotice can render", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    act(() => {
      worker.emitMLStatus("segmentation", "failed");
      worker.emitMLError("segmentation", "model_load_failed");
    });
    expect(result.current.state.mlStatus.segmentation).toBe("failed");
    expect(result.current.state.mlError?.stage).toBe("segmentation");
    expect(result.current.state.mlError?.code).toBe("model_load_failed");
  });

  it("U8 (Covers F3): first-render-start sets firstRenderActive=true; first-render-end sets it false", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    expect(result.current.state.firstRenderActive).toBe(false);

    act(() => {
      worker.emitFirstRenderStart("source-A");
    });
    expect(result.current.state.firstRenderActive).toBe(true);

    act(() => {
      worker.emitFirstRenderEnd("source-A");
    });
    expect(result.current.state.firstRenderActive).toBe(false);
  });

  it("U8: ml-status / first-render messages do NOT touch processing status or stale jobId", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    // Run a normal dispatch.
    act(() => {
      result.current.process(fakeBitmap(), 64, { sourceId: "s8" });
      vi.advanceTimersByTime(16);
    });
    expect(result.current.state.status).toBe("processing");

    // ml-status / first-render arriving mid-processing must not flip status.
    act(() => {
      worker.emitMLStatus("segmentation", "loading");
      worker.emitFirstRenderStart("s8");
    });
    expect(result.current.state.status).toBe("processing");
    expect(result.current.state.mlStatus.segmentation).toBe("loading");
    expect(result.current.state.firstRenderActive).toBe(true);

    // The actual result still resolves status normally.
    act(() => {
      worker.emitFirstRenderEnd("s8");
      worker.emitResult(1, 64, 51);
    });
    expect(result.current.state.firstRenderActive).toBe(false);
    expect(result.current.state.status).toBe("ready");
  });

  it("dropping a queued bitmap (replaced before debounce flush) closes the old one", () => {
    vi.useFakeTimers();
    const worker = new MockWorker();
    const { result } = renderHook(() =>
      usePixelArtPipeline({ debounceMs: 16, workerFactory: () => worker as unknown as Worker }),
    );

    const first = fakeBitmap();
    const second = fakeBitmap();
    act(() => {
      result.current.process(first, 32, { sourceId: "test-source-7" });
      // Before debounce flushes, dispatch again — first bitmap is now stranded
      // unless the hook closes it. Verify it does.
      result.current.process(second, 64, { sourceId: "test-source-7" });
    });
    expect((first as unknown as { __closed: boolean }).__closed).toBe(true);
    expect((second as unknown as { __closed: boolean }).__closed).toBe(false);
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(worker.sent.length).toBe(1);
    expect(worker.sent[0]?.targetLongEdge).toBe(64);
  });
});
