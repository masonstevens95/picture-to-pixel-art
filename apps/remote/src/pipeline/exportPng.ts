/**
 * Export a quantized result buffer as a PNG download at native pixel size.
 *
 * Native size means the PNG file's pixel dimensions match the result buffer
 * exactly — a 64-long-edge landscape source produces a 64×48 PNG (per AE2),
 * not an upscaled version. The browser injects no smoothing here because we
 * never `drawImage` to a different size; we just `putImageData` 1:1 and
 * `convertToBlob` it.
 *
 * v3: the buffer's alpha is preserved through to the PNG. Silhouette-enabled
 * outputs carry alpha=0 on background pixels and survive export with
 * transparency intact (R10). This file does NOT force alpha=255 anywhere —
 * the quantizer's per-pixel alpha=255 write happens before silhouette's
 * applyMask, so alpha=0 from silhouette is the final value reaching here.
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

/**
 * Build the export filename. When `style` is provided and not "custom",
 * the active style is included so users batching outputs into a folder
 * can sort/group them: `pixel-art-environment-192x144.png`. Custom and
 * undefined produce the v2 naming `pixel-art-WxH.png`.
 */
export function pngFilename(width: number, height: number, style?: string): string {
  if (style && style !== "custom") {
    return `pixel-art-${style}-${width}x${height}.png`;
  }
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

export async function downloadResultAsPng(
  buffer: ExportableBuffer,
  style?: string,
): Promise<void> {
  const blob = await bufferToPngBlob(buffer);
  triggerDownload(blob, pngFilename(buffer.width, buffer.height, style));
}
