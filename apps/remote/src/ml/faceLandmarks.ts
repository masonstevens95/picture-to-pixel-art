/**
 * MediaPipe Face Landmarker integration (U6).
 *
 * Lazy-loads the `@mediapipe/tasks-vision` bundle on first call,
 * initializes a `FaceLandmarker` from a jsDelivr-hosted `.task` model
 * asset, and exposes a `detectLandmarks` adapter that normalizes the
 * MediaPipe result shape to `NormalizedLandmark[] | null` (single-face,
 * any "no face detected" outcome collapses to `null`).
 *
 * Why this module owns the lazy-import / fileset / .task URL:
 *   MediaPipe is a separate runtime from ORT (U1). The U1 `getOrtSession`
 *   helper is for `.onnx` models on `onnxruntime-web`; MediaPipe's
 *   `FaceLandmarker.createFromOptions` expects its own `WasmFileset` from
 *   `FilesetResolver.forVisionTasks(...)`. We don't share infrastructure.
 *
 * Why pinned exact version (no caret, no `latest`):
 *   jsDelivr resolves `latest` at edge. A compromised npm release of
 *   `@mediapipe/tasks-vision` would propagate to every user without us
 *   noticing. The `package.json` dependency is pinned to `0.10.18` and the
 *   CDN URLs below interpolate that exact same version. Bumps are explicit
 *   review steps, not silent.
 *
 * Cancellation: `runAndCacheLandmarks` mirrors U5's `runAndCacheSegmentation`
 * — if the user dropped a new image while detection was in flight, the
 * write-back is dropped (the new sourceId no longer matches the cache),
 * but the detected landmarks are still returned to the caller for the
 * in-flight dispatch. This blocks cache pollution without blocking single-
 * job correctness.
 */

import { MLRuntimeError } from "./types";
import type { NormalizedLandmark, SourceCacheManager } from "../pipeline/sourceCache";

/**
 * Pinned MediaPipe Tasks Vision version. Doc-review security requirement:
 * an exact version (NOT `^0.10.18` or `latest`) so the jsDelivr URLs below
 * don't tolerate a silent supply-chain shift. Bumps require:
 *   1. Update this constant.
 *   2. Update `apps/remote/package.json` `dependencies` entry to match.
 *   3. Re-run `pnpm install` and verify the lockfile + tests.
 *
 * Stays in sync with `apps/remote/package.json`'s pinned dependency.
 */
const TASKS_VISION_VERSION = "0.10.18";

/**
 * jsDelivr CDN URL for the MediaPipe Tasks Vision WASM fileset.
 *
 * `FilesetResolver.forVisionTasks(basePath)` reads the fileset's
 * `wasm_internal.js` + `wasm_internal.wasm` from this prefix. The directory
 * layout under `npm/@mediapipe/tasks-vision@<v>/wasm/` is the canonical
 * location maintained by the package authors.
 */
const WASM_FILESET_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

/**
 * `.task` bundle URL for the Face Landmarker model.
 *
 * MediaPipe ships the model file under Google Cloud Storage (the canonical
 * `mediapipe-models` bucket) — this is the URL pattern recommended by the
 * MediaPipe Face Landmarker Web guide. The `latest/` segment is Google's
 * own latest tag and is acceptable here because the model file format
 * versions independently of the npm SDK; if a future-incompatible model
 * version drops, we can pin to a frozen path.
 *
 * TODO(verify): if this URL becomes unavailable, swap in the npm-hosted
 * `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/face_landmarker.task`
 * mirror or self-host the asset in our deploy bucket.
 */
const FACE_LANDMARKER_TASK_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

/** Confidence floor for a face to count as detected. MediaPipe default is 0.5. */
const MIN_FACE_DETECTION_CONFIDENCE = 0.5;

/**
 * Minimal subset of the MediaPipe surface we use. Typed locally so the
 * module signature doesn't pull MediaPipe types into every consumer. The
 * actual instances come from the lazy-imported runtime module.
 */
interface FaceLandmarkerLike {
  detect(image: ImageData): { faceLandmarks?: NormalizedLandmark[][] };
}

interface TasksVisionModuleLike {
  FilesetResolver: {
    forVisionTasks(basePath: string): Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions(
      wasmFileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string };
        runningMode: "IMAGE" | "VIDEO";
        numFaces?: number;
        minFaceDetectionConfidence?: number;
      },
    ): Promise<FaceLandmarkerLike>;
  };
}

/**
 * Memoised handles. The module is dynamically imported once; the
 * `FaceLandmarker` is instantiated once per session. Subsequent calls
 * (segmentation runs concurrently with face detection on different pixels;
 * Portrait filter dispatches re-fire as the user adjusts knobs) reuse
 * both without re-fetching anything.
 */
let modulePromise: Promise<TasksVisionModuleLike> | null = null;
let landmarkerPromise: Promise<FaceLandmarkerLike> | null = null;

async function loadTasksVisionModule(): Promise<TasksVisionModuleLike> {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        return (await import(
          "@mediapipe/tasks-vision"
        )) as unknown as TasksVisionModuleLike;
      } catch (cause) {
        throw new MLRuntimeError(
          "model_load_failed",
          "Failed to import @mediapipe/tasks-vision",
          { cause },
        );
      }
    })();
  }
  return modulePromise;
}

async function getLandmarker(): Promise<FaceLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const tasks = await loadTasksVisionModule();
      let fileset: unknown;
      try {
        fileset = await tasks.FilesetResolver.forVisionTasks(WASM_FILESET_URL);
      } catch (cause) {
        throw new MLRuntimeError(
          "model_fetch_failed",
          `Failed to fetch MediaPipe Tasks WASM fileset from ${WASM_FILESET_URL}`,
          { cause, modelUrl: WASM_FILESET_URL },
        );
      }
      try {
        return await tasks.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_TASK_URL },
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: MIN_FACE_DETECTION_CONFIDENCE,
        });
      } catch (cause) {
        throw new MLRuntimeError(
          "model_load_failed",
          `Failed to create FaceLandmarker from ${FACE_LANDMARKER_TASK_URL}`,
          { cause, modelUrl: FACE_LANDMARKER_TASK_URL },
        );
      }
    })();
  }
  return landmarkerPromise;
}

/**
 * Production face-landmark detection. Lazy-loads MediaPipe on first call.
 *
 * Returns `null` for both empty-result shapes:
 *   - `result.faceLandmarks` is missing or empty (no face detected at all)
 *   - `result.faceLandmarks[0]` is empty (degenerate detector output)
 *
 * This normalization keeps the call-site ergonomics simple: callers
 * check `landmarks === null` for "no boost path" instead of having to
 * branch on two shape variants.
 */
async function detectLandmarksImpl(
  source: ImageData,
): Promise<NormalizedLandmark[] | null> {
  if (source.width <= 0 || source.height <= 0) {
    throw new MLRuntimeError(
      "inference_failed",
      `Source dims must be positive, got ${source.width}x${source.height}`,
    );
  }

  const landmarker = await getLandmarker();

  let result: { faceLandmarks?: NormalizedLandmark[][] };
  try {
    result = landmarker.detect(source);
  } catch (cause) {
    throw new MLRuntimeError(
      "inference_failed",
      "FaceLandmarker.detect threw",
      { cause },
    );
  }

  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }
  const firstFace = result.faceLandmarks[0];
  if (!firstFace || firstFace.length === 0) {
    return null;
  }
  return firstFace;
}

/**
 * Test seam: replace `detectLandmarks` for the duration of a test so the
 * jsdom suite never lazy-imports the real MediaPipe bundle (which expects
 * a browser environment with WASM/Worker support). Mirrors the U5
 * `__setPrepareInputForTests` pattern.
 *
 * Worker integration tests use this to inject mock landmark coords or
 * mock failures without the heavy MediaPipe runtime.
 */
let detectLandmarksOverride:
  | ((source: ImageData) => Promise<NormalizedLandmark[] | null>)
  | null = null;

export function __setDetectLandmarksForTests(
  impl: (source: ImageData) => Promise<NormalizedLandmark[] | null>,
): void {
  detectLandmarksOverride = impl;
}

export function __resetDetectLandmarksForTests(): void {
  detectLandmarksOverride = null;
  modulePromise = null;
  landmarkerPromise = null;
}

/**
 * Public entry point. Detects faces in `source`. Returns a single-face
 * landmark array (478 points in MediaPipe's canonical mesh) or `null`
 * when no face is detected.
 *
 * Failure modes (typed `MLRuntimeError`):
 *   - `model_fetch_failed`: WASM fileset download failed.
 *   - `model_load_failed`: SDK import or `FaceLandmarker.createFromOptions` threw.
 *   - `inference_failed`: detector threw synchronously, or invalid source dims.
 *
 * The worker catches `MLRuntimeError` and falls back to the `null` /
 * face-boost-skipped path; callers don't need to retry.
 */
export async function detectLandmarks(
  source: ImageData,
): Promise<NormalizedLandmark[] | null> {
  if (detectLandmarksOverride) {
    return detectLandmarksOverride(source);
  }
  return detectLandmarksImpl(source);
}

/**
 * Worker-facing wrapper: detect, then guard write-back against the active
 * source-cache.
 *
 * Mirrors `runAndCacheSegmentation` from U5. Both `landmarks` and
 * `landmarksAttempted` are written when the sourceId still matches; on a
 * stale sourceId we drop the write entirely so the new cache entry's
 * `landmarksAttempted` flag remains `false` and the worker re-runs
 * detection on the next `faceAwareEnabled=true` dispatch for that source.
 */
export async function runAndCacheLandmarks(
  source: ImageData,
  sourceId: string,
  cacheManager: SourceCacheManager,
): Promise<NormalizedLandmark[] | null> {
  const landmarks = await detectLandmarks(source);
  const active = cacheManager.get(sourceId);
  if (active) {
    active.landmarks = landmarks;
    active.landmarksAttempted = true;
  }
  // else: stale dispatch, cache moved on. Caller still uses the returned
  // landmarks for its in-flight dispatch.
  return landmarks;
}
