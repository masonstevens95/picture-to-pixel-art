import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "../../src/App";

/**
 * Harness integration tests. The single most important invariant here is AE3:
 * the same component that ships through Module Federation also renders cleanly
 * inside the standalone shell — no wrapping ProjectPageTemplate from the host,
 * no console errors about missing host context.
 */

describe("harness App", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the page header and the alias-imported PixelArtApp body", () => {
    render(<App />);
    // Header and subtitle copy commit (no implementer guesswork).
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByText("Picture to Pixel Art")[0]).toBeInTheDocument();
    expect(
      screen.getByText("Drop a photo, choose a resolution, download pixel art."),
    ).toBeInTheDocument();
    // Footer privacy line.
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByText("Runs entirely in your browser. No upload, no backend."),
    ).toBeInTheDocument();
  });

  it("AE3: mounts cold without portfolio shell context and emits no console errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    render(<App />);

    // No error or warn output — would fire if PixelArtApp tried to use
    // host-only context like a router or a portfolio-template provider.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not bring in a portfolio host shell", () => {
    render(<App />);
    // ProjectPageTemplate-style header text from the host would surface here
    // if PixelArtApp leaked a host dependency. It must not.
    expect(screen.queryByText(/Calculators/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ProjectPageTemplate/i)).not.toBeInTheDocument();
  });
});
