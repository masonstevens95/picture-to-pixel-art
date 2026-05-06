import { describe, expect, it } from "vitest";
import { centerCrop } from "../../src/pipeline/crop";

function makeSolid(width: number, height: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

function makeGradient(width: number, height: number): ImageData {
  // x-position encoded in red, y-position in green, so we can verify offset math.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe("centerCrop", () => {
  it("returns input unchanged when source already matches the target ratio", () => {
    const src = makeSolid(100, 100, 50, 50, 50);
    const out = centerCrop(src, 1);
    expect(out).toBe(src);
  });

  it("crops a 4000x3000 source to 1:1 → 3000x3000 centered on the source", () => {
    const src = makeSolid(4000, 3000, 100, 100, 100);
    const out = centerCrop(src, 1);
    expect(out.width).toBe(3000);
    expect(out.height).toBe(3000);
    // Solid input → solid output.
    expect(out.data[0]).toBe(100);
  });

  it("crops a 1000x2000 source to 4:3 (ratio 1.333) → 1000x750", () => {
    const src = makeSolid(1000, 2000, 50, 50, 50);
    const out = centerCrop(src, 4 / 3);
    expect(out.width).toBe(1000);
    expect(out.height).toBe(750);
  });

  it("crops a portrait-source 600x800 to 16:9 — shrinks height", () => {
    const src = makeSolid(600, 800, 80, 80, 80);
    const out = centerCrop(src, 16 / 9);
    expect(out.width).toBe(600);
    // 600 / (16/9) = 337.5 → rounds to 338
    expect(out.height).toBe(338);
  });

  it("centers the crop window on the source for a wider-than-target image", () => {
    const src = makeGradient(10, 6);
    // target ratio 1:1 → 6x6 crop, centered → x offset = 2
    const out = centerCrop(src, 1);
    expect(out.width).toBe(6);
    expect(out.height).toBe(6);
    // First pixel of cropped data should have x=2 (the center-crop offset).
    expect(out.data[0]).toBe(2);
    expect(out.data[1]).toBe(0);
  });

  it("centers the crop window on the source for a taller-than-target image", () => {
    const src = makeGradient(6, 10);
    // target ratio 1:1 → 6x6 crop, centered → y offset = 2
    const out = centerCrop(src, 1);
    expect(out.width).toBe(6);
    expect(out.height).toBe(6);
    // First pixel of cropped data should have y=2.
    expect(out.data[0]).toBe(0); // x=0
    expect(out.data[1]).toBe(2); // y=2
  });

  it("rejects zero or negative target ratio", () => {
    const src = makeSolid(8, 8, 0, 0, 0);
    expect(() => centerCrop(src, 0)).toThrow();
    expect(() => centerCrop(src, -1)).toThrow();
    expect(() => centerCrop(src, Number.NaN)).toThrow();
  });

  it("preserves alpha when the source has explicit alpha", () => {
    const data = new Uint8ClampedArray(100 * 100 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;
      data[i + 1] = 100;
      data[i + 2] = 50;
      data[i + 3] = 128;
    }
    const src = new ImageData(data, 100, 100);
    const out = centerCrop(src, 2); // 100/100=1, target 2 → 100x50 crop
    expect(out.width).toBe(100);
    expect(out.height).toBe(50);
    // Sample alpha is preserved.
    expect(out.data[3]).toBe(128);
  });
});
