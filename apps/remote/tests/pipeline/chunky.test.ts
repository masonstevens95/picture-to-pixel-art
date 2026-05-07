import { describe, expect, it } from "vitest";
import { chunkify } from "../../src/pipeline/chunky";

function makeImage(pixels: Array<[number, number, number, number?]>, width: number): ImageData {
  const height = pixels.length / width;
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a = 255], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return new ImageData(data, width, height);
}

describe("chunkify", () => {
  it("chunkSize=1 returns input unchanged (R12 invariant)", () => {
    const src = makeImage(
      [
        [10, 20, 30],
        [40, 50, 60],
      ],
      2,
    );
    expect(chunkify(src, 1)).toBe(src);
  });

  it("chunkSize=2 on 2x1 input produces 4x2 output of repeated blocks", () => {
    const src = makeImage(
      [
        [255, 0, 0],
        [0, 255, 0],
      ],
      2,
    );
    const out = chunkify(src, 2);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    // Top-left 2x2 block should be all red.
    for (const offset of [0, 4, 16, 20]) {
      expect(out.data[offset]).toBe(255);
      expect(out.data[offset + 1]).toBe(0);
      expect(out.data[offset + 2]).toBe(0);
    }
    // Top-right 2x2 block (px 2-3) should be all green.
    for (const offset of [8, 12, 24, 28]) {
      expect(out.data[offset]).toBe(0);
      expect(out.data[offset + 1]).toBe(255);
    }
  });

  it("chunkSize=3 produces 3x output in each dimension", () => {
    const src = makeImage([[100, 100, 100]], 1);
    const out = chunkify(src, 3);
    expect(out.width).toBe(3);
    expect(out.height).toBe(3);
  });

  it("preserves alpha within blocks (transparent pixels stay transparent)", () => {
    const src = makeImage(
      [
        [0, 0, 0, 0], // transparent
        [255, 255, 255, 255], // opaque
      ],
      2,
    );
    const out = chunkify(src, 2);
    // Top-left 2x2 block alpha = 0
    expect(out.data[3]).toBe(0);
    expect(out.data[4 + 3]).toBe(0);
    // Top-right 2x2 block alpha = 255
    expect(out.data[8 + 3]).toBe(255);
  });

  it("rejects chunkSize < 1", () => {
    const src = makeImage([[0, 0, 0]], 1);
    expect(() => chunkify(src, 0)).toThrow();
    expect(() => chunkify(src, -1)).toThrow();
    expect(() => chunkify(src, Number.NaN)).toThrow();
  });

  it("clamps chunkSize above MAX_CHUNK_SIZE silently", () => {
    const src = makeImage([[100, 100, 100]], 1);
    const out = chunkify(src, 8); // gets clamped to 4
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
  });

  it("1x1 input with chunkSize=4 produces 4x4 output of identical pixels", () => {
    const src = makeImage([[200, 100, 50]], 1);
    const out = chunkify(src, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(4);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(200);
      expect(out.data[i + 1]).toBe(100);
      expect(out.data[i + 2]).toBe(50);
    }
  });
});
