/**
 * Test environment polyfills.
 *
 * jsdom ships without `ImageData` unless the `canvas` native package is
 * installed; we don't want a native dep just for tests, and our pipeline
 * code only uses ImageData as a typed-array container with width/height
 * metadata. A minimal polyfill is enough.
 *
 * Real-canvas behavior (createImageBitmap, OffscreenCanvas, drawImage) is
 * exercised in browser-mode tests via Playwright when those land.
 */

if (typeof (globalThis as unknown as { ImageData?: unknown }).ImageData === "undefined") {
  class ImageDataPolyfill {
    public readonly data: Uint8ClampedArray;
    public readonly width: number;
    public readonly height: number;
    public readonly colorSpace: "srgb" = "srgb";

    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      height?: number,
    ) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        if (height === undefined) {
          this.height = dataOrWidth.length / 4 / widthOrHeight;
        } else {
          this.height = height;
        }
      } else {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData =
    ImageDataPolyfill;
}
