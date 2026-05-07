/**
 * Per-source-id cache living inside the pixel-art worker (U2).
 *
 * Why this exists: v4 introduces three source-derived stages whose output
 * depends only on (source-id, source-id-and-smoothness, source-id) — bilateral
 * smoothing (U3), segmentation mask (U5), and face landmarks (U6). Each is
 * expensive enough that we don't want to recompute it on every slider move.
 *
 * Why a typed struct, not Record<string, unknown>:
 *   The consumer set is closed and known (three slots, three writers). A
 *   typed struct gives the writers static field shapes, makes invalidation
 *   semantics legible at the call site, and avoids smearing key conventions
 *   across files. The doc-review consensus rejected Record<string, unknown>
 *   for losing type safety without buying flexibility we'd actually use.
 *
 * Why single-entry: source identity changes drop everything. There is no
 * meaningful workflow where two sources are processed in parallel — the
 * UI shows one image at a time, and any switch invalidates every cached
 * derivation. "LRU effectively" with N=1 is the simplest correct shape.
 *
 * Memory bound: exactly one `SourceCache` is resident. Switching between
 * arbitrarily many source-ids in sequence keeps a single entry alive at
 * any given moment.
 *
 * Worker termination drops the manager along with the worker; no explicit
 * shutdown step is required.
 */

/**
 * Type-only import: doesn't generate a runtime require, so the heavy
 * `@mediapipe/tasks-vision` bundle stays out of the worker until U6's
 * face-landmark stage actually fires (lazy `import()` in `faceLandmarks.ts`).
 *
 * Re-exported below so consumers (`faceBoost.ts`, `faceLandmarks.ts`) can
 * pull the canonical type from one place.
 */
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type { NormalizedLandmark };

export interface SourceCache {
  /**
   * Identifies which bilateral params produced `bilateralOutput`. Empty
   * string means "no bilateral output cached yet". U3 sets this to e.g.
   * `'off' | 'low' | 'medium' | 'high'` and re-runs bilateral when the
   * key changes; smoothness changes do NOT invalidate the segmentation
   * mask or landmarks, which depend on source identity alone.
   */
  smoothnessKey: string;
  /** U3 writes the post-bilateral source. Null until U3 runs. */
  bilateralOutput: ImageData | null;
  /** U5 writes the binary background mask. Null until U5 runs. */
  segmentationMask: ImageData | null;
  /**
   * U6 writes the face-landmark array. Null in two cases:
   *   - never attempted (gated by `landmarksAttempted=false`), or
   *   - attempted but no face detected (then `landmarksAttempted=true`).
   *
   * The pair `(landmarks, landmarksAttempted)` distinguishes "never ran"
   * from "ran, no face" so the worker R12 gate doesn't redundantly invoke
   * MediaPipe on every dispatch for a faceless source.
   */
  landmarks: NormalizedLandmark[] | null;
  /**
   * Sentinel: has the face-landmark detector been invoked for this source
   * yet? Set to `true` after a single attempt regardless of outcome. The
   * worker keys re-detection on `(faceAwareEnabled === true) && !landmarksAttempted`.
   */
  landmarksAttempted: boolean;
}

function emptyCache(): SourceCache {
  return {
    smoothnessKey: "",
    bilateralOutput: null,
    segmentationMask: null,
    landmarks: null,
    landmarksAttempted: false,
  };
}

export class SourceCacheManager {
  private current: { sourceId: string; cache: SourceCache } | null = null;

  /**
   * Return the active cache only when its sourceId matches; otherwise null.
   * No mutation, no eviction. Callers that want lazy initialization should
   * use `getOrInit` instead.
   */
  get(sourceId: string): SourceCache | null {
    if (this.current && this.current.sourceId === sourceId) {
      return this.current.cache;
    }
    return null;
  }

  /**
   * Return the active cache for `sourceId`, evicting the previous entry
   * (if any) when the id differs. The returned object is mutated in place
   * by U3/U5/U6 — same source-id always returns the same reference.
   */
  getOrInit(sourceId: string): SourceCache {
    if (this.current && this.current.sourceId === sourceId) {
      return this.current.cache;
    }
    const cache = emptyCache();
    this.current = { sourceId, cache };
    return cache;
  }

  /**
   * Drop the active entry if and only if its sourceId matches. Inactive
   * ids are a silent no-op — callers don't need to know which entry is
   * currently resident.
   */
  invalidate(sourceId: string): void {
    if (this.current && this.current.sourceId === sourceId) {
      this.current = null;
    }
  }
}
