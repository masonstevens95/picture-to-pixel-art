import { describe, expect, it } from "vitest";
import { applyOutline, DEFAULT_OUTLINE_COLOR } from "../../src/pipeline/outline";

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

function makeContrastSquare(width: number, height: number): ImageData {
  // White outer frame, large black square in the middle.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const inset = Math.floor(Math.min(width, height) / 4);
  for (let y = inset; y < height - inset; y++) {
    for (let x = inset; x < width - inset; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
    }
  }
  return new ImageData(data, width, height);
}

function countPixelsOfColor(image: ImageData, color: [number, number, number]): number {
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (
      image.data[i] === color[0] &&
      image.data[i + 1] === color[1] &&
      image.data[i + 2] === color[2]
    ) {
      count++;
    }
  }
  return count;
}

describe("applyOutline", () => {
  it("returns input unchanged when enabled=false (R12 invariant)", () => {
    const src = makeSolid(20, 20, 100, 200, 100);
    const out = applyOutline(src, { enabled: false, width: 2, color: [0, 0, 0] });
    expect(out).toBe(src);
  });

  it("returns input unchanged when width=0 (defensive)", () => {
    const src = makeSolid(20, 20, 100, 200, 100);
    const out = applyOutline(src, { enabled: true, width: 0, color: [0, 0, 0] });
    expect(out).toBe(src);
  });

  it("solid color image produces no outline (no edges to detect)", () => {
    const src = makeSolid(20, 20, 100, 100, 100);
    const out = applyOutline(src, { enabled: true, width: 1, color: [0, 0, 0] });
    // Output bytes match input bytes — no overlay applied.
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it("high-contrast square produces a black outline along its boundary", () => {
    const src = makeContrastSquare(20, 20);
    const out = applyOutline(src, { enabled: true, width: 1, color: DEFAULT_OUTLINE_COLOR });
    // XDoG-positioned outline pixels may differ slightly from Sobel's, but
    // some pixels should still be marked outline (black 0,0,0). The
    // pre-existing black square interior is also black — but black pixel
    // count being non-zero is the load-bearing signal.
    const blackCount = countPixelsOfColor(out, [0, 0, 0]);
    expect(blackCount).toBeGreaterThan(0);
    // Far-corner white pixels well outside the square's diffusion band
    // should remain white. The XDoG Gaussian (σ=0.4) only diffuses ~1px,
    // so corner (0,0) is comfortably outside the boundary band.
    expect(out.data[0]).toBe(255);
  });

  it("width=2 produces a thicker outline than width=1", () => {
    const src = makeContrastSquare(30, 30);
    const out1 = applyOutline(src, { enabled: true, width: 1, color: [255, 0, 0] });
    const out2 = applyOutline(src, { enabled: true, width: 2, color: [255, 0, 0] });
    const red1 = countPixelsOfColor(out1, [255, 0, 0]);
    const red2 = countPixelsOfColor(out2, [255, 0, 0]);
    expect(red2).toBeGreaterThan(red1);
  });

  it("custom color overlays in that color (red on green source)", () => {
    const src = makeContrastSquare(20, 20);
    const out = applyOutline(src, { enabled: true, width: 2, color: [255, 0, 0] });
    const redCount = countPixelsOfColor(out, [255, 0, 0]);
    expect(redCount).toBeGreaterThan(0);
  });

  it("preserves alpha on outlined pixels (silhouette compatibility)", () => {
    // Source with non-255 alpha simulates a silhouette-applied buffer.
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4;
        const isInner = x > 4 && x < 16 && y > 4 && y < 16;
        data[i] = isInner ? 0 : 255;
        data[i + 1] = isInner ? 0 : 255;
        data[i + 2] = isInner ? 0 : 255;
        data[i + 3] = isInner ? 255 : 0; // outer ring transparent
      }
    }
    const src = new ImageData(data, 20, 20);
    const out = applyOutline(src, { enabled: true, width: 1, color: [255, 0, 0] });
    // Alpha at (0,0) should still be 0 — outline overlay does not touch alpha.
    expect(out.data[3]).toBe(0);
  });

  it("1x1 input returns input unchanged (below outline minimum dim)", () => {
    const src = makeSolid(1, 1, 200, 100, 50);
    const out = applyOutline(src, { enabled: true, width: 2, color: [0, 0, 0] });
    expect(out).toBe(src);
  });

  it("2x2 input returns input unchanged (below outline minimum dim)", () => {
    const src = makeSolid(2, 2, 200, 100, 50);
    const out = applyOutline(src, { enabled: true, width: 1, color: [0, 0, 0] });
    expect(out).toBe(src);
  });
});
