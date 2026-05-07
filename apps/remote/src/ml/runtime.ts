/**
 * ONNX Runtime Web adapter (U1).
 *
 * Thin façade over `onnxruntime-web/wasm`. Goals:
 *  1. Lazy import: `onnxruntime-web` is ~1 MB minified. We never load it
 *     until a consumer (U5, U6) actually asks for a session, so users
 *     who never hit an ML stage never pay the bundle cost.
 *  2. WASM-only: importing `onnxruntime-web/wasm` (instead of the full
 *     `onnxruntime-web`) tree-shakes the WebGPU and WebGL execution
 *     providers. We don't use them — Module Federation hosts can't
 *     guarantee COOP/COEP so threads + GPU paths are off the table — and
 *     the slimmer entry point shaves a meaningful chunk off the lazy
 *     payload.
 *  3. Single thread: `numThreads = 1` is mandatory in the MF host. We
 *     don't have cross-origin isolation, so `SharedArrayBuffer` is
 *     unavailable and ORT's threaded WASM blob would fail to spawn.
 *  4. Single-session-per-model: a `Promise<InferenceSessionWrapper>` is
 *     memoised by URL so repeat callers (U5 + U6 + retry paths) share
 *     the same session and don't pay the ORT init cost twice.
 *  5. Corrupt-cache self-heal: if `InferenceSession.create()` throws on
 *     a cached ArrayBuffer (truncated download, platform cache fault),
 *     we evict the entry and retry once. Without this, one bad cache
 *     write degrades the user permanently until the next cache version
 *     bump. Second failure surfaces as a typed `MLRuntimeError`.
 *
 * Warmup is deliberately not run here. The plan calls out that warmup
 * needs the model's input shape — that lives on `ModelDescriptor`, which
 * the consumer (U5/U6) owns. Pushing warmup into the consumer keeps U1
 * minimal (no per-shape tensor allocation in this layer) and matches
 * the saturation pattern: identity-by-default, work-on-demand.
 *
 * Pattern reference: `apps/remote/src/pipeline/saturation.ts` — same
 * shape (thin façade, lazy work, no work on the default path).
 */

import { fetchModel, evictModel } from "./modelCache";
import { type InferenceSessionWrapper, type ModelDescriptor, MLRuntimeError } from "./types";

/**
 * Default jsDelivr CDN URL prefix for the ORT WASM artifacts.
 *
 * Override path: assign a different value before the first `getOrtSession`
 * call by exporting + reassigning a module-level variable in a build-time
 * config layer, OR — preferred — host the artifacts ourselves and change
 * this constant in a deploy. Runtime override knobs are deferred until
 * a use case appears; YAGNI for v4.
 */
const WASM_PATHS_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.0/dist/";

/**
 * Lazy ORT module handle. The first `getOrtSession` call dynamically
 * imports `onnxruntime-web/wasm`, configures `ort.env.wasm`, and stashes
 * the module here so subsequent calls skip both the import and the env
 * mutation.
 */
type OrtModule = typeof import("onnxruntime-web/wasm");
let ortModulePromise: Promise<OrtModule> | null = null;

/** Per-URL session cache. Stores promises so concurrent callers share one init. */
const sessionPromises = new Map<string, Promise<InferenceSessionWrapper>>();

async function loadOrt(): Promise<OrtModule> {
  if (!ortModulePromise) {
    ortModulePromise = (async () => {
      // Dynamic import keeps ORT out of the main bundle until first use.
      const ort = (await import("onnxruntime-web/wasm")) as OrtModule;
      // jsDelivr-hosted WASM artifacts. Single source so the runtime
      // doesn't need a network probe.
      ort.env.wasm.wasmPaths = WASM_PATHS_CDN;
      // No COOP/COEP in the MF host → no SharedArrayBuffer → must be 1.
      ort.env.wasm.numThreads = 1;
      return ort;
    })();
  }
  return ortModulePromise;
}

/**
 * Resolve (or create + memoise) an inference session for the given model.
 *
 * On corrupt-cache: evicts the entry, refetches, and retries
 * `InferenceSession.create()` exactly once. A second failure surfaces
 * as `MLRuntimeError('model_load_failed')`.
 */
export async function getOrtSession(
  descriptor: ModelDescriptor,
): Promise<InferenceSessionWrapper> {
  const cached = sessionPromises.get(descriptor.url);
  if (cached) return cached;

  const promise = createSession(descriptor).catch((err) => {
    // Don't memoise failures — the next call should be allowed to retry
    // (e.g. user came back online). Drop the entry and rethrow.
    sessionPromises.delete(descriptor.url);
    throw err;
  });
  sessionPromises.set(descriptor.url, promise);
  return promise;
}

async function createSession(descriptor: ModelDescriptor): Promise<InferenceSessionWrapper> {
  const ort = await loadOrt();

  // First attempt: use whatever fetchModel hands back (cached or fresh).
  const buffer = await fetchModel(descriptor.url);
  try {
    const session = await ort.InferenceSession.create(buffer);
    return { descriptor, session };
  } catch (firstErr) {
    // Could be a corrupt cached entry. Evict + refetch + retry once.
    await evictModel(descriptor.url);
    let retryBuffer: ArrayBuffer;
    try {
      retryBuffer = await fetchModel(descriptor.url);
    } catch (refetchErr) {
      throw new MLRuntimeError(
        "model_load_failed",
        `Model load failed and refetch after eviction failed for ${descriptor.url}`,
        { cause: refetchErr, modelUrl: descriptor.url },
      );
    }
    try {
      const session = await ort.InferenceSession.create(retryBuffer);
      return { descriptor, session };
    } catch (retryErr) {
      throw new MLRuntimeError(
        "model_load_failed",
        `Model load failed twice for ${descriptor.url} (first error: ${stringifyError(firstErr)})`,
        { cause: retryErr, modelUrl: descriptor.url },
      );
    }
  }
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "<unstringifiable>";
  }
}

/** Test-only: clear the per-URL session cache so a test can re-init. */
export function __resetRuntimeForTests(): void {
  sessionPromises.clear();
  ortModulePromise = null;
}
