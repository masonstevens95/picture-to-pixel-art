import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pngFilename, triggerDownload } from "../../src/pipeline/exportPng";

describe("pngFilename", () => {
  it("includes the actual output dimensions (Covers AE2)", () => {
    expect(pngFilename(64, 48)).toBe("pixel-art-64x48.png");
    expect(pngFilename(256, 256)).toBe("pixel-art-256x256.png");
    expect(pngFilename(16, 12)).toBe("pixel-art-16x12.png");
  });

  it("v2 naming preserved when style is undefined or 'custom'", () => {
    expect(pngFilename(64, 64)).toBe("pixel-art-64x64.png");
    expect(pngFilename(64, 64, "custom")).toBe("pixel-art-64x64.png");
  });

  it("includes Style for non-Custom (Covers AE6)", () => {
    expect(pngFilename(192, 144, "environment")).toBe("pixel-art-environment-192x144.png");
    expect(pngFilename(48, 48, "asset")).toBe("pixel-art-asset-48x48.png");
    expect(pngFilename(256, 256, "art-piece")).toBe("pixel-art-art-piece-256x256.png");
  });
});

describe("triggerDownload", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an anchor with the correct download filename and href, then revokes the URL", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "image/png" });

    triggerDownload(blob, "pixel-art-64x48.png");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);

    // Revocation runs in a microtask — flush it.
    await Promise.resolve();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
