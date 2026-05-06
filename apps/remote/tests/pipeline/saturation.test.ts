import { describe, expect, it } from "vitest";
import { saturationAdjust } from "../../src/pipeline/saturation";

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

describe("saturationAdjust", () => {
  it("amount=0 returns the input ImageData unchanged (byte-identical)", () => {
    const input = makeImage([
      [200, 100, 50],
      [10, 200, 100],
      [128, 128, 128],
    ]);
    const out = saturationAdjust(input, 0);
    expect(out).toBe(input); // same reference — short-circuit returns input directly
    expect(Array.from(out.data)).toEqual(Array.from(input.data));
  });

  it("amount=-1 collapses every pixel to its grayscale equivalent (R=G=B)", () => {
    const input = makeImage([
      [200, 50, 50],
      [10, 200, 100],
      [255, 0, 128],
    ]);
    const out = saturationAdjust(input, -1);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(out.data[i + 1]);
      expect(out.data[i + 1]).toBe(out.data[i + 2]);
    }
  });

  it("amount=+1 increases saturation of a mid-saturation color toward its hue's max", () => {
    const input = makeImage([[150, 100, 100]]); // mid-saturated reddish
    const before = input.data;
    const after = saturationAdjust(input, 1).data;
    // Red channel rises (or stays), green/blue fall (or stay), max-min spread widens.
    const beforeSpread = Math.max(before[0]!, before[1]!, before[2]!) - Math.min(before[0]!, before[1]!, before[2]!);
    const afterSpread = Math.max(after[0]!, after[1]!, after[2]!) - Math.min(after[0]!, after[1]!, after[2]!);
    expect(afterSpread).toBeGreaterThan(beforeSpread);
  });

  it("pure grayscale input (R=G=B) is unchanged at any non-zero saturation value", () => {
    const input = makeImage([
      [128, 128, 128],
      [40, 40, 40],
      [200, 200, 200],
    ]);
    const inputSnapshot = Array.from(input.data);

    for (const amount of [-0.5, +0.5, -1, +1]) {
      const out = saturationAdjust(input, amount);
      // Every pixel still grayscale and unchanged from the source (S was already 0).
      for (let i = 0; i < out.data.length; i += 4) {
        expect(out.data[i]).toBe(inputSnapshot[i]);
        expect(out.data[i + 1]).toBe(inputSnapshot[i + 1]);
        expect(out.data[i + 2]).toBe(inputSnapshot[i + 2]);
      }
    }
  });

  it("preserves alpha channel for any saturation value", () => {
    const input = makeImage([
      [100, 50, 50, 200],
      [10, 200, 100, 64],
    ]);
    for (const amount of [-1, -0.3, +0.3, +1]) {
      const out = saturationAdjust(input, amount);
      expect(out.data[3]).toBe(200);
      expect(out.data[7]).toBe(64);
    }
  });

  it("rejects non-finite amount", () => {
    const input = makeImage([[10, 20, 30]]);
    expect(() => saturationAdjust(input, Number.NaN)).toThrow();
    expect(() => saturationAdjust(input, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("amount=-1 followed by +1 does NOT round-trip (lossy after grayscale collapse)", () => {
    // Sanity check that the short-circuit at 0 is what's load-bearing for
    // the byte-equality test, not a hidden roundtrip-perfect property.
    const input = makeImage([[200, 100, 50]]);
    const grayscale = saturationAdjust(input, -1);
    const restored = saturationAdjust(grayscale, +1);
    // Restored is still grayscale because the source (after -1) had S=0.
    expect(restored.data[0]).toBe(restored.data[1]);
  });
});
