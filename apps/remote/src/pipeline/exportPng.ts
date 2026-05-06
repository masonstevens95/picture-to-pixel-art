/**
 * Export a quantized result buffer as a PNG download at native pixel size.
 *
 * Native size means the PNG file's pixel dimensions match the result buffer
 * exactly — a 64-long-edge landscape source produces a 64×48 PNG (per AE2),
 * not an upscaled version. The browser injects no smoothing here because we
 * never `drawImage` to a different size; we just `putImageData` 1:1 and
 * `convertToBlob` it.
 */

export interface ExportableBuffer {
  width: number;
  height: number;
  /** RGBA, length = width * height * 4. Should already be fully opaque. */
  pixels: Uint8ClampedArray;
}

export async function bufferToPngBlob(buffer: ExportableBuffer): Promise<Blob> {
  if (buffer.width <= 0 || buffer.height <= 0) {
    throw new Error(`Invalid buffer dims ${buffer.width}x${buffer.height}`);
  }
  if (buffer.pixels.length !== buffer.width * buffer.height * 4) {
    throw new Error(
      `Pixel buffer length ${buffer.pixels.length} does not match ${buffer.width}x${buffer.height}x4`,
    );
  }

  const canvas = new OffscreenCanvas(buffer.width, buffer.height);
  const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!ctx) throw new Error("Could not acquire 2D context for PNG export");

  ctx.imageSmoothingEnabled = false;
  const imageData = new ImageData(
    new Uint8ClampedArray(buffer.pixels),
    buffer.width,
    buffer.height,
  );
  ctx.putImageData(imageData, 0, 0);

  return canvas.convertToBlob({ type: "image/png" });
}

export function pngFilename(width: number, height: number): string {
  return `pixel-art-${width}x${height}.png`;
}

/**
 * Trigger a browser download for the given Blob with the given filename.
 * Revokes the object URL on the next microtask so it doesn't leak.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Microtask is enough — the download has been kicked off by .click().
  queueMicrotask(() => URL.revokeObjectURL(url));
}

export async function downloadResultAsPng(buffer: ExportableBuffer): Promise<void> {
  const blob = await bufferToPngBlob(buffer);
  triggerDownload(blob, pngFilename(buffer.width, buffer.height));
}
