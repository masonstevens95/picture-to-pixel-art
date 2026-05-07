import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPurgeForTests,
  evictModel,
  fetchModel,
  purgeOldCaches,
} from "../../src/ml/modelCache";
import { MLRuntimeError } from "../../src/ml/types";

/**
 * Cache Storage stub.
 *
 * The real `caches` global is a `CacheStorage` instance. Tests inject a
 * minimal shape that records `match`/`put`/`delete`/`keys` calls and
 * lets each test assert which path the code took.
 */

interface FakeCache {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  store: Map<string, Response>;
}

interface FakeCacheStorage {
  open: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  caches: Map<string, FakeCache>;
}

function makeFakeCache(): FakeCache {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, response: Response) => {
      store.set(key, response);
    }),
    delete: vi.fn(async (key: string) => store.delete(key)),
  };
}

function makeFakeCacheStorage(initial: Record<string, FakeCache> = {}): FakeCacheStorage {
  const caches = new Map<string, FakeCache>(Object.entries(initial));
  return {
    caches,
    open: vi.fn(async (name: string) => {
      let cache = caches.get(name);
      if (!cache) {
        cache = makeFakeCache();
        caches.set(name, cache);
      }
      return cache;
    }),
    keys: vi.fn(async () => Array.from(caches.keys())),
    delete: vi.fn(async (name: string) => caches.delete(name)),
  };
}

const MODEL_URL = "https://cdn.example.com/models/segformer.onnx";

let originalCaches: unknown;
let originalFetch: typeof globalThis.fetch | undefined;
let fakeStorage: FakeCacheStorage;

beforeEach(() => {
  __resetPurgeForTests();
  originalCaches = (globalThis as { caches?: unknown }).caches;
  originalFetch = globalThis.fetch;
  fakeStorage = makeFakeCacheStorage();
  (globalThis as unknown as { caches: FakeCacheStorage }).caches = fakeStorage;
});

afterEach(() => {
  if (originalCaches === undefined) {
    delete (globalThis as { caches?: unknown }).caches;
  } else {
    (globalThis as { caches?: unknown }).caches = originalCaches;
  }
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: unknown }).fetch;
  }
  vi.restoreAllMocks();
});

function mockFetchOnce(response: Response | (() => Promise<Response>)): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    typeof response === "function" ? response() : response,
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

function makeOkResponse(bytes: Uint8Array): Response {
  // jsdom Response; `type` defaults to "default" / "basic" which is what
  // we want for the non-CORS-blocked path. Wrap in ArrayBuffer to keep
  // the BodyInit overload happy across TS DOM lib versions.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Response(buffer);
}

describe("modelCache.fetchModel — happy path", () => {
  it("first call misses, fetches, and writes to cache; second call hits cache and skips fetch", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const fetchMock = mockFetchOnce(makeOkResponse(bytes));

    const buf1 = await fetchModel(MODEL_URL);
    expect(new Uint8Array(buf1)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const v1Cache = fakeStorage.caches.get("pixelart-models-v1");
    expect(v1Cache).toBeDefined();
    expect(v1Cache!.put).toHaveBeenCalledTimes(1);
    expect(v1Cache!.store.has(MODEL_URL)).toBe(true);

    // Second call: cache hit, no new fetch.
    const buf2 = await fetchModel(MODEL_URL);
    expect(new Uint8Array(buf2)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still 1 — no re-fetch
  });
});

describe("modelCache.fetchModel — QuotaExceededError on cache.put", () => {
  it("returns the ArrayBuffer despite the cache write failing; subsequent fetch re-downloads", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn(async () => makeOkResponse(bytes));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    // Pre-create the v1 cache and override `put` to throw QuotaExceededError.
    const v1Cache = makeFakeCache();
    const quotaErr = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    v1Cache.put = vi.fn(async () => {
      throw quotaErr;
    });
    fakeStorage.caches.set("pixelart-models-v1", v1Cache);

    const buf = await fetchModel(MODEL_URL);
    expect(new Uint8Array(buf)).toEqual(bytes);
    expect(v1Cache.put).toHaveBeenCalledTimes(1);

    // Cache stayed empty — subsequent fetch re-downloads.
    const buf2 = await fetchModel(MODEL_URL);
    expect(new Uint8Array(buf2)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("modelCache.purgeOldCaches", () => {
  it("deletes prefixed-but-stale caches and preserves the current allow-list and unrelated caches", async () => {
    fakeStorage.caches.set("pixelart-models-v1", makeFakeCache());
    fakeStorage.caches.set("pixelart-models-old", makeFakeCache());
    fakeStorage.caches.set("pixelart-models-experimental", makeFakeCache());
    fakeStorage.caches.set("random-other-cache", makeFakeCache()); // host page or third-party

    await purgeOldCaches();

    expect(fakeStorage.caches.has("pixelart-models-v1")).toBe(true);
    expect(fakeStorage.caches.has("pixelart-models-old")).toBe(false);
    expect(fakeStorage.caches.has("pixelart-models-experimental")).toBe(false);
    // Critical: a non-prefixed cache must NEVER be deleted by this helper.
    expect(fakeStorage.caches.has("random-other-cache")).toBe(true);
  });

  it("is idempotent across calls (memoised promise)", async () => {
    fakeStorage.caches.set("pixelart-models-old", makeFakeCache());
    await purgeOldCaches();
    await purgeOldCaches();
    // Second call shouldn't re-list keys (still 1 invocation)
    expect(fakeStorage.keys).toHaveBeenCalledTimes(1);
  });
});

describe("modelCache.fetchModel — error paths", () => {
  it("network failure surfaces a typed MLRuntimeError with code='model_fetch_failed'", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Network down");
    }) as unknown as typeof globalThis.fetch;

    await expect(fetchModel(MODEL_URL)).rejects.toBeInstanceOf(MLRuntimeError);
    await expect(fetchModel(MODEL_URL)).rejects.toMatchObject({
      code: "model_fetch_failed",
      modelUrl: MODEL_URL,
    });
  });

  it("opaque (CORS-blocked) response surfaces MLRuntimeError(code='cors_blocked') and does NOT cache", async () => {
    // Response with `type: 'opaque'` — we fake the property since the
    // platform only produces opaque responses for cross-origin no-cors
    // fetches and we can't trigger that in jsdom.
    const opaqueResponse = new Response(null);
    Object.defineProperty(opaqueResponse, "type", { value: "opaque" });
    globalThis.fetch = vi.fn(async () => opaqueResponse) as unknown as typeof globalThis.fetch;

    await expect(fetchModel(MODEL_URL)).rejects.toMatchObject({
      code: "cors_blocked",
      modelUrl: MODEL_URL,
    });

    // No cache.put call — we never store opaque blobs.
    const v1Cache = fakeStorage.caches.get("pixelart-models-v1");
    if (v1Cache) {
      expect(v1Cache.put).not.toHaveBeenCalled();
    }
  });

  it("does NOT cache when the body fails to read mid-stream", async () => {
    // Response whose `arrayBuffer()` rejects partway through.
    const failingResponse = {
      type: "default",
      ok: true,
      status: 200,
      arrayBuffer: vi.fn(async () => {
        throw new Error("aborted mid-read");
      }),
    } as unknown as Response;
    globalThis.fetch = vi.fn(async () => failingResponse) as unknown as typeof globalThis.fetch;

    await expect(fetchModel(MODEL_URL)).rejects.toMatchObject({
      code: "model_fetch_failed",
    });

    // Crucially, `cache.put` was never called — no truncated entry.
    const v1Cache = fakeStorage.caches.get("pixelart-models-v1");
    if (v1Cache) {
      expect(v1Cache.put).not.toHaveBeenCalled();
    }
  });
});

describe("modelCache.evictModel", () => {
  it("removes a cached entry; subsequent fetch re-downloads", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async () => makeOkResponse(bytes));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    // Prime the cache.
    await fetchModel(MODEL_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Evict.
    const evicted = await evictModel(MODEL_URL);
    expect(evicted).toBe(true);

    // Re-fetch should hit the network again.
    await fetchModel(MODEL_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when there's nothing to evict", async () => {
    const evicted = await evictModel(MODEL_URL);
    expect(evicted).toBe(false);
  });
});
