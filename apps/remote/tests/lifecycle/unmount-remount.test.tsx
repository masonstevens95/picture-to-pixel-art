import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PixelArtApp from "../../src/exposes/PixelArtApp";

/**
 * AE4 lifecycle coverage. The worker-cleanup half of AE4 is exercised by the
 * usePixelArtPipeline tests (terminate on unmount, close pending bitmap on
 * unmount, close replaced bitmap on dispatch). This file covers the
 * PixelArtApp-side: object URLs revoked on every file replacement, and on
 * the final unmount, across multiple mount/unmount cycles.
 *
 * createImageBitmap doesn't exist in jsdom, so the mount/unmount harness
 * stubs it to a sync-resolving fake that hands back a closable bitmap. The
 * point of the test is the URL + bitmap.close spy ledger, not real decode
 * behavior.
 */

interface FakeBitmap extends ImageBitmap {
  __closed: boolean;
}

function makeFakeBitmap(): FakeBitmap {
  const bm = {
    width: 100,
    height: 80,
    __closed: false,
    close() {
      bm.__closed = true;
    },
  };
  return bm as unknown as FakeBitmap;
}

function imageFile(name = "x.png", type = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

let producedBitmaps: FakeBitmap[];

beforeEach(() => {
  producedBitmaps = [];
  const createBitmapStub = vi.fn(async () => {
    const bm = makeFakeBitmap();
    producedBitmaps.push(bm);
    return bm;
  });
  (globalThis as unknown as { createImageBitmap: typeof createBitmapStub }).createImageBitmap =
    createBitmapStub;

  let urlCounter = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    urlCounter += 1;
    return `blob:url-${urlCounter}`;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
});

describe("PixelArtApp lifecycle", () => {
  it("revokes the source object URL when the file is replaced", async () => {
    render(<PixelArtApp />);

    // Drop file 1
    const zone = screen.getByRole("button", { name: /Upload an image/ });
    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile("a.png")], items: [{ kind: "file", type: "image/png" }] },
    });
    await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

    // Drop file 2 — first URL must be revoked.
    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile("b.png")], items: [{ kind: "file", type: "image/png" }] },
    });
    await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url-1");
  });

  it("revokes the source object URL on unmount", async () => {
    const { unmount } = render(<PixelArtApp />);

    const zone = screen.getByRole("button", { name: /Upload an image/ });
    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile()], items: [{ kind: "file", type: "image/png" }] },
    });
    await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalled();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url-1");
  });

  it("AE4: three mount/unmount cycles each with a drop reach a clean state — every URL revoked", async () => {
    for (let i = 0; i < 3; i++) {
      const { unmount } = render(<PixelArtApp />);
      const zone = screen.getByRole("button", { name: /Upload an image/ });
      fireEvent.drop(zone, {
        dataTransfer: { files: [imageFile()], items: [{ kind: "file", type: "image/png" }] },
      });
      // Let the bitmap-decoding effect resolve.
      await Promise.resolve();
      await Promise.resolve();
      unmount();
      cleanup();
    }

    // Three mounts × one drop each = 3 createObjectURL calls, 3 revokes.
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBeGreaterThanOrEqual(3);
    // Every minted URL has been revoked — the difference between mints and
    // revokes is the live mounted URL count, which after the final unmount
    // must be zero.
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(
      vi.mocked(URL.createObjectURL).mock.calls.length,
    );
  });

  it("closes intermediate ImageBitmaps when the file is replaced (Covers AE4 bitmap half)", async () => {
    render(<PixelArtApp />);
    const zone = screen.getByRole("button", { name: /Upload an image/ });

    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile("a.png")], items: [{ kind: "file", type: "image/png" }] },
    });
    // Let the decode effect resolve so the first bitmap is retained.
    await Promise.resolve();
    await Promise.resolve();

    fireEvent.drop(zone, {
      dataTransfer: { files: [imageFile("b.png")], items: [{ kind: "file", type: "image/png" }] },
    });
    await Promise.resolve();
    await Promise.resolve();

    // First retained bitmap must be closed when the second drop replaces it.
    // (PixelArtApp keeps a sourceBitmapRef and closes the prior on replacement.)
    const closedCount = producedBitmaps.filter((b) => b.__closed).length;
    expect(closedCount).toBeGreaterThanOrEqual(1);
  });
});
