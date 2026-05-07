import { describe, expect, it } from "vitest";
import { posterize } from "../../src/pipeline/posterize";

function makeImage(pixels: Array<[number, number, number, number?]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a = 255], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return new ImageData(data, pixels.length, 1);
}

function distinctValuesPerChannel(image: ImageData): { r: Set<number>; g: Set<number>; b: Set<number> } {
  const r = new Set<number>();
  const g = new Set<number>();
  const b = new Set<number>();
  for (let i = 0; i < image.data.length; i += 4) {
    r.add(image.data[i]!);
    g.add(image.data[i + 1]!);
    b.add(image.data[i + 2]!);
  }
  return { r, g, b };
}

describe("posterize", () => {
  it("bands=undefined returns input unchanged (R12 invariant)", () => {
    const src = makeImage([
      [200, 100, 50],
      [10, 200, 100],
    ]);
    const out = posterize(src, undefined);
    expect(out).toBe(src);
  });

  it("bands<2 (defensive) returns input unchanged", () => {
    const src = makeImage([[100, 100, 100]]);
    expect(posterize(src, 0)).toBe(src);
    expect(posterize(src, 1)).toBe(src);
  });

  it("bands=2 collapses each channel to two values (0 or 255)", () => {
    const src = makeImage([
      [10, 100, 200],
      [50, 150, 250],
      [120, 130, 140],
    ]);
    const out = posterize(src, 2);
    const { r, g, b } = distinctValuesPerChannel(out);
    for (const set of [r, g, b]) {
      for (const v of set) {
        expect([0, 255]).toContain(v);
      }
    }
  });

  it("bands=4 produces at most 4 distinct values per channel across a varied input", () => {
    const src = makeImage(
      Array.from({ length: 50 }, (_, i) => [i * 5, 255 - i * 5, 128] as [number, number, number]),
    );
    const out = posterize(src, 4);
    const { r, g } = distinctValuesPerChannel(out);
    expect(r.size).toBeLessThanOrEqual(4);
    expect(g.size).toBeLessThanOrEqual(4);
  });

  it("bands=8 produces at most 8 distinct values per channel", () => {
    const src = makeImage(
      Array.from({ length: 100 }, (_, i) => [i * 2.5, 100, 50] as [number, number, number]),
    );
    const out = posterize(src, 8);
    const { r } = distinctValuesPerChannel(out);
    expect(r.size).toBeLessThanOrEqual(8);
  });

  it("preserves alpha channel", () => {
    const src = makeImage([
      [100, 100, 100, 200],
      [50, 50, 50, 64],
    ]);
    const out = posterize(src, 4);
    expect(out.data[3]).toBe(200);
    expect(out.data[7]).toBe(64);
  });

  it("rejects non-finite bands", () => {
    const src = makeImage([[100, 100, 100]]);
    expect(() => posterize(src, Number.NaN)).toThrow();
    expect(() => posterize(src, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("preserves source dims", () => {
    const src = makeImage([
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ]);
    const out = posterize(src, 4);
    expect(out.width).toBe(3);
    expect(out.height).toBe(1);
  });
});
