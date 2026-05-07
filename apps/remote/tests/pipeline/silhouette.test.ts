import { describe, expect, it } from "vitest";
import {
  applyMask,
  buildMask,
  downscaleMask,
  sampleBackgroundColor,
} from "../../src/pipeline/silhouette";

function makeImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return new ImageData(data, width, height);
}

describe("sampleBackgroundColor", () => {
  it("returns the corner color for a uniform-corner image", () => {
    const src = makeImage(10, 10, () => [255, 255, 255, 255]);
    expect(sampleBackgroundColor(src)).toEqual([255, 255, 255]);
  });

  it("averages the four corners when they differ", () => {
    const src = makeImage(2, 2, (x, y) => {
      if (x === 0 && y === 0) return [200, 0, 0, 255];
      if (x === 1 && y === 0) return [0, 200, 0, 255];
      if (x === 0 && y === 1) return [0, 0, 200, 255];
      return [200, 200, 200, 255];
    });
    expect(sampleBackgroundColor(src)).toEqual([100, 100, 100]);
  });
});

describe("buildMask", () => {
  it("zeroes alpha for pixels within tolerance of background", () => {
    const src = makeImage(4, 4, (x, y) =>
      x === 0 && y === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const mask = buildMask(src, [255, 255, 255], 12);
    // Top-left pixel is far from white background → foreground (alpha=255).
    expect(mask.data[3]).toBe(255);
    // Bottom-right pixel is white → background (alpha=0).
    const last = (4 * 3 + 3) * 4 + 3;
    expect(mask.data[last]).toBe(0);
  });

  it("higher tolerance catches more pixels as background", () => {
    const src = makeImage(10, 10, (x) => (x < 5 ? [240, 240, 240, 255] : [255, 255, 255, 255]));
    const tight = buildMask(src, [255, 255, 255], 5);
    const loose = buildMask(src, [255, 255, 255], 30);
    let tightBg = 0;
    let looseBg = 0;
    for (let i = 3; i < tight.data.length; i += 4) {
      if (tight.data[i] === 0) tightBg++;
      if (loose.data[i] === 0) looseBg++;
    }
    expect(looseBg).toBeGreaterThan(tightBg);
  });
});

describe("downscaleMask", () => {
  it("preserves binary alpha values (no mid-alpha from area-averaging)", () => {
    const src = makeImage(8, 8, (x, y) => {
      const isBg = x < 4 && y < 4;
      return [0, 0, 0, isBg ? 0 : 255];
    });
    const out = downscaleMask(src, 4, 4);
    for (let i = 3; i < out.data.length; i += 4) {
      expect([0, 255]).toContain(out.data[i]);
    }
  });

  it("returns input when target meets or exceeds source dims", () => {
    const src = makeImage(4, 4, () => [0, 0, 0, 255]);
    expect(downscaleMask(src, 8, 8)).toBe(src);
  });

  it("rejects non-positive target dims", () => {
    const src = makeImage(4, 4, () => [0, 0, 0, 255]);
    expect(() => downscaleMask(src, 0, 4)).toThrow();
    expect(() => downscaleMask(src, 4, -1)).toThrow();
  });
});

describe("applyMask", () => {
  it("zeroes alpha at masked positions, preserves foreground alpha", () => {
    const image = makeImage(4, 4, () => [200, 100, 50, 255]);
    const mask = makeImage(4, 4, (x, y) => [0, 0, 0, x === 0 && y === 0 ? 0 : 255]);
    const out = applyMask(image, mask);
    expect(out.data[3]).toBe(0);
    // Other pixels still 255.
    expect(out.data[7]).toBe(255);
  });

  it("preserves RGB channels untouched", () => {
    const image = makeImage(2, 1, () => [100, 150, 200, 255]);
    const mask = makeImage(2, 1, () => [0, 0, 0, 0]); // mark all as bg
    const out = applyMask(image, mask);
    expect(out.data[0]).toBe(100);
    expect(out.data[1]).toBe(150);
    expect(out.data[2]).toBe(200);
    expect(out.data[3]).toBe(0);
  });

  it("throws on dim mismatch", () => {
    const image = makeImage(2, 2, () => [0, 0, 0, 255]);
    const mask = makeImage(3, 3, () => [0, 0, 0, 0]);
    expect(() => applyMask(image, mask)).toThrow();
  });
});
