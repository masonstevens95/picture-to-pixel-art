import PixelArtApp from "@pixelart/remote/exposes/PixelArtApp";

/**
 * Standalone shell. Mirrors the dark/neutral aesthetic of the portfolio host
 * so visitors landing on the standalone URL get a consistent visual language,
 * but provides its own chrome — title, header, footer link — since there's no
 * portfolio shell to inherit from here.
 *
 * Per origin R9: "minimum chrome: page title, a header identifying the tool".
 */
export default function App() {
  return (
    <div className="flex min-h-full flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-4 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
            Picture to Pixel Art
          </h1>
          <p className="text-xs text-neutral-500">
            Drop a photo, choose a resolution, download pixel art.
          </p>
        </div>
      </header>
      <main className="flex-1">
        <PixelArtApp />
      </main>
      <footer className="border-t border-neutral-800 px-4 py-3 text-center text-xs text-neutral-600">
        Runs entirely in your browser. No upload, no backend.
      </footer>
    </div>
  );
}
