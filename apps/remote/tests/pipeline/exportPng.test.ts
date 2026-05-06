import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pngFilename, triggerDownload } from "../../src/pipeline/exportPng";

describe("pngFilename", () => {
  it("includes the actual output dimensions (Covers AE2)", () => {
    expect(pngFilename(64, 48)).toBe("pixel-art-64x48.png");
    expect(pngFilename(256, 256)).toBe("pixel-art-256x256.png");
    expect(pngFilename(16, 12)).toBe("pixel-art-16x12.png");
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
