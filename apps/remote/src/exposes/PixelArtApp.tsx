/**
 * Default-exported entry point for the pixel-art microfrontend.
 *
 * Two consumers load this same component:
 *   - Portfolio host: `lazy(() => import("remote/PixelArtApp"))` via Module Federation.
 *   - Standalone harness: direct workspace-aliased import.
 *
 * U1 ships a placeholder card so the federation pipeline is verifiable end-to-end
 * before the real UI lands in U5.
 */
export default function PixelArtApp() {
  return (
    <main className="flex min-h-full items-center justify-center bg-neutral-950 px-4 py-12">
      <section className="w-full max-w-6xl rounded-lg border border-neutral-800 bg-neutral-900 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-neutral-100">Picture to Pixel Art</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Drag a photo, choose a resolution, get pixel art back.
        </p>
        <p className="mt-6 text-xs text-neutral-500">
          v1 scaffold — drop zone, slider, and side-by-side preview land in U5.
        </p>
      </section>
    </main>
  );
}
