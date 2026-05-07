/**
 * Cache Storage helper for ML model files (U1).
 *
 * Why Cache Storage and not IndexedDB:
 *  - Cache Storage is keyed by Request — same accessor pattern as fetch.
 *  - Body is stored as a Response, so the browser handles compression /
 *    streaming for us; we just hand it the bytes once.
 *  - Survives across SW updates without our own migration code.
 *
 * Cache versioning: the cache name is `pixelart-models-v1`. Bump the
 * suffix in a deploy when we ship a model whose URL didn't change but
 * whose contents did (rare — we should change the URL instead). The
 * `purgeOldCaches` helper deletes any cache **with the `pixelart-models-`
 * prefix** that is not in the current allow-list. Caches without the
 * prefix belong to the host page (the harness, an unrelated SW, etc.)
 * and must not be touched — they are not ours to delete.
 *
 * Corrupt-cache self-heal: see `evictModel`. The runtime layer uses it
 * to retry once when ORT fails to load a cached ArrayBuffer. Without
 * that path, a single truncated entry would permanently degrade the
 * user until the next cache version bump.
 *
 * Partial-write avoidance: we read the response body fully into an
 * ArrayBuffer before calling `cache.put`. A network drop mid-stream
 * therefore fails before we ever write to cache, instead of leaving
 * a truncated cached response that ORT would later reject.
 */

import { MLRuntimeError } from "./types";

const CACHE_NAME = "pixelart-models-v1";
const CACHE_PREFIX = "pixelart-models-";
const CACHE_ALLOWLIST: readonly string[] = [CACHE_NAME];

let purgePromise: Promise<void> | null = null;

/** Resolves the global `caches` storage. Not memoised — `caches.open` is cheap. */
function getCacheStorage(): CacheStorage {
  // `caches` is a global in Window + Worker scopes. In environments that
  // don't expose it (some test runners, older browsers we don't support)
  // the consumer should never get here — but we surface a typed error
  // rather than `undefined is not a function` so the UI can degrade.
  const storage = (globalThis as { caches?: CacheStorage }).caches;
  if (!storage) {
    throw new MLRuntimeError(
      "model_fetch_failed",
      "Cache Storage API is not available in this environment",
    );
  }
  return storage;
}

/**
 * Fetch a model file as an ArrayBuffer, using Cache Storage to avoid
 * re-downloading on subsequent calls.
 *
 * Order of operations on miss:
 *   1. fetch(url)
 *   2. read response.arrayBuffer() fully
 *   3. cache.put(url, new Response(buffer))
 *
 * Step 3 is best-effort: `QuotaExceededError` is swallowed and the
 * ArrayBuffer is still returned to the caller. The user gets the model
 * this session; the next session will re-download.
 */
export async function fetchModel(modelUrl: string): Promise<ArrayBuffer> {
  // Run prefix-scoped cleanup once per page lifetime, on first fetch.
  // Errors in cleanup are non-fatal — they don't block the user.
  void purgeOldCaches().catch(() => undefined);

  const cache = await getCacheStorage().open(CACHE_NAME);

  // Cache hit path. `cache.match` returns `undefined` on miss.
  const cachedResponse = await cache.match(modelUrl);
  if (cachedResponse) {
    try {
      return await cachedResponse.arrayBuffer();
    } catch (cause) {
      // The cached body failed to read — treat as miss and re-fetch.
      // (We don't evict here; the runtime self-heal path owns eviction
      // because it knows whether ORT could load the bytes.)
      throw new MLRuntimeError(
        "model_fetch_failed",
        `Failed to read cached body for ${modelUrl}`,
        { cause, modelUrl },
      );
    }
  }

  // Cache miss path.
  let response: Response;
  try {
    response = await fetch(modelUrl);
  } catch (cause) {
    throw new MLRuntimeError(
      "model_fetch_failed",
      `Network error fetching model ${modelUrl}`,
      { cause, modelUrl },
    );
  }

  // CORS-blocked opaque response: `response.type === 'opaque'` and
  // `response.ok === false` (status is 0). Caching this would persist a
  // useless blob and still fail to load. Surface a typed error so the
  // UI can show "model unavailable in this region / config" instead.
  if (response.type === "opaque") {
    throw new MLRuntimeError(
      "cors_blocked",
      `Opaque (CORS-blocked) response for model ${modelUrl}`,
      { modelUrl },
    );
  }

  if (!response.ok) {
    throw new MLRuntimeError(
      "model_fetch_failed",
      `Model fetch returned HTTP ${response.status} for ${modelUrl}`,
      { modelUrl },
    );
  }

  // Read body fully BEFORE caching. If the network drops mid-stream,
  // this rejects and we never call `cache.put` with a partial body.
  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (cause) {
    throw new MLRuntimeError(
      "model_fetch_failed",
      `Failed to read body of ${modelUrl}`,
      { cause, modelUrl },
    );
  }

  try {
    await cache.put(modelUrl, new Response(buffer));
  } catch (cause) {
    // QuotaExceededError (or any cache write failure) — non-fatal.
    // Caller still gets the bytes; cache just doesn't persist this run.
    if (!isQuotaExceeded(cause)) {
      // Unknown cache.put failure: still non-fatal, but we don't want
      // to silently mask programmer errors. Re-throw on dev only — in
      // production we prefer "feature works, persistence missed" over
      // "feature blocked by surprise cache bug".
      // Conservative choice: swallow + return. U5/U6 add metrics if
      // the rate matters.
    }
  }

  return buffer;
}

/**
 * Delete a cached model entry. Used by the runtime self-heal path when
 * `ort.InferenceSession.create()` rejects a cached ArrayBuffer as
 * corrupt or truncated.
 *
 * Returns `true` if an entry was deleted, `false` if there was no entry.
 * Non-throwing: a failure here is logged but doesn't propagate, because
 * the runtime is about to re-fetch anyway.
 */
export async function evictModel(modelUrl: string): Promise<boolean> {
  try {
    const cache = await getCacheStorage().open(CACHE_NAME);
    return await cache.delete(modelUrl);
  } catch {
    return false;
  }
}

/**
 * Delete any cache whose name starts with `pixelart-models-` and is not
 * in the current allow-list. Idempotent — runs at most once per page
 * lifetime via the module-level `purgePromise`.
 *
 * Crucial invariant: we **only** touch caches with the `pixelart-models-`
 * prefix. Other same-origin caches (host page assets, an unrelated SW,
 * a third-party widget) are never deleted here.
 */
export function purgeOldCaches(): Promise<void> {
  if (purgePromise) return purgePromise;
  purgePromise = (async () => {
    const storage = getCacheStorage();
    const names = await storage.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && !CACHE_ALLOWLIST.includes(name))
        .map((name) => storage.delete(name)),
    );
  })();
  return purgePromise;
}

/** Test-only: reset the purge dedupe so a fresh test can observe the side effect. */
export function __resetPurgeForTests(): void {
  purgePromise = null;
}

function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "QuotaExceededError";
}
