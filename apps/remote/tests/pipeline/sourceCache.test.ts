import { describe, expect, it } from "vitest";
import { SourceCacheManager } from "../../src/pipeline/sourceCache";

/**
 * U2 source-cache manager tests.
 *
 * The manager is single-entry: any new sourceId evicts the previous entry.
 * No consumers populate the cache yet — U3/U5/U6 will. These tests exercise
 * the lifecycle contract that the consumers will rely on.
 */

function makeImageData(width = 2, height = 2): ImageData {
  return new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
}

describe("SourceCacheManager", () => {
  it("getOrInit returns a fresh entry with all-null slots and empty smoothnessKey", () => {
    const mgr = new SourceCacheManager();
    const cache = mgr.getOrInit("A");
    expect(cache.smoothnessKey).toBe("");
    expect(cache.bilateralOutput).toBeNull();
    expect(cache.segmentationMask).toBeNull();
    expect(cache.landmarks).toBeNull();
    // U6: a fresh entry has never attempted face-landmark detection. The
    // worker keys re-detection on `(faceAwareEnabled && !landmarksAttempted)`,
    // so a freshly-evicted source must default to false.
    expect(cache.landmarksAttempted).toBe(false);
  });

  it("returning to a previously-active id after eviction resets landmarksAttempted to false", () => {
    const mgr = new SourceCacheManager();
    const a1 = mgr.getOrInit("A");
    a1.landmarksAttempted = true;
    a1.landmarks = [{ x: 0.5, y: 0.5, z: 0, visibility: 1 }];
    mgr.getOrInit("B");
    const a2 = mgr.getOrInit("A");
    expect(a2.landmarksAttempted).toBe(false);
    expect(a2.landmarks).toBeNull();
  });

  it("getOrInit returns the same reference for repeated calls with the same sourceId", () => {
    const mgr = new SourceCacheManager();
    const a1 = mgr.getOrInit("A");
    a1.smoothnessKey = "low";
    a1.bilateralOutput = makeImageData();
    const a2 = mgr.getOrInit("A");
    expect(a2).toBe(a1);
    expect(a2.smoothnessKey).toBe("low");
    expect(a2.bilateralOutput).not.toBeNull();
  });

  it("get returns the active entry only when sourceId matches", () => {
    const mgr = new SourceCacheManager();
    const a = mgr.getOrInit("A");
    expect(mgr.get("A")).toBe(a);
    expect(mgr.get("B")).toBeNull();
  });

  it("get on an empty manager returns null", () => {
    const mgr = new SourceCacheManager();
    expect(mgr.get("anything")).toBeNull();
  });

  it("getOrInit('B') after getOrInit('A') evicts A — get('A') returns null", () => {
    const mgr = new SourceCacheManager();
    const a = mgr.getOrInit("A");
    a.bilateralOutput = makeImageData();
    const b = mgr.getOrInit("B");
    expect(b).not.toBe(a);
    expect(b.bilateralOutput).toBeNull();
    expect(mgr.get("A")).toBeNull();
    expect(mgr.get("B")).toBe(b);
  });

  it("invalidate(activeId) drops the entry; subsequent get returns null", () => {
    const mgr = new SourceCacheManager();
    mgr.getOrInit("A");
    mgr.invalidate("A");
    expect(mgr.get("A")).toBeNull();
  });

  it("invalidate(unknownId) is a no-op when a different id is active", () => {
    const mgr = new SourceCacheManager();
    const a = mgr.getOrInit("A");
    mgr.invalidate("B");
    expect(mgr.get("A")).toBe(a);
  });

  it("invalidate on an empty manager is a no-op", () => {
    const mgr = new SourceCacheManager();
    expect(() => mgr.invalidate("X")).not.toThrow();
    expect(mgr.get("X")).toBeNull();
  });

  it("memory bound: repeated source switches keep exactly one entry resident", () => {
    const mgr = new SourceCacheManager();
    const ids = ["A", "B", "C", "D", "E"];
    let last: string | null = null;
    for (const id of ids) {
      mgr.getOrInit(id);
      // Every previously-active id must now be evicted.
      if (last !== null) {
        expect(mgr.get(last)).toBeNull();
      }
      // The just-inserted id is the only one resident.
      expect(mgr.get(id)).not.toBeNull();
      for (const other of ids) {
        if (other !== id) {
          expect(mgr.get(other)).toBeNull();
        }
      }
      last = id;
    }
  });

  it("returning to a previously-active id after eviction yields a fresh entry, not the old one", () => {
    const mgr = new SourceCacheManager();
    const a1 = mgr.getOrInit("A");
    a1.smoothnessKey = "high";
    a1.bilateralOutput = makeImageData();
    mgr.getOrInit("B");
    const a2 = mgr.getOrInit("A");
    expect(a2).not.toBe(a1);
    expect(a2.smoothnessKey).toBe("");
    expect(a2.bilateralOutput).toBeNull();
  });
});
