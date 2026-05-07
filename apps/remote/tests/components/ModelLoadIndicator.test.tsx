import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ModelLoadIndicator from "../../src/components/ModelLoadIndicator";
import type { MLStatusMap } from "../../src/hooks/usePixelArtPipeline";

describe("ModelLoadIndicator", () => {
  afterEach(() => cleanup());

  it("renders the loading copy when segmentation is loading", () => {
    const status: MLStatusMap = { segmentation: "loading" };
    render(<ModelLoadIndicator mlStatus={status} />);
    expect(screen.getByText(/Loading enhanced features/i)).toBeInTheDocument();
  });

  it("renders the loading copy when face-landmarks is loading", () => {
    const status: MLStatusMap = { "face-landmarks": "loading" };
    render(<ModelLoadIndicator mlStatus={status} />);
    expect(screen.getByText(/Loading enhanced features/i)).toBeInTheDocument();
  });

  it("hides the inner panel when no stage is loading", () => {
    render(<ModelLoadIndicator mlStatus={{}} />);
    expect(screen.queryByText(/Loading enhanced features/i)).not.toBeInTheDocument();
  });

  it("hides the inner panel when all stages are ready", () => {
    const status: MLStatusMap = {
      segmentation: "ready",
      "face-landmarks": "ready",
    };
    render(<ModelLoadIndicator mlStatus={status} />);
    expect(screen.queryByText(/Loading enhanced features/i)).not.toBeInTheDocument();
  });

  it("hides the inner panel when a stage failed (DegradedModeNotice owns failed UI)", () => {
    const status: MLStatusMap = { segmentation: "failed" };
    render(<ModelLoadIndicator mlStatus={status} />);
    expect(screen.queryByText(/Loading enhanced features/i)).not.toBeInTheDocument();
  });

  it("STILL renders loading when one stage is loading and another is ready (multi-stage)", () => {
    const status: MLStatusMap = {
      segmentation: "loading",
      "face-landmarks": "ready",
    };
    render(<ModelLoadIndicator mlStatus={status} />);
    expect(screen.getByText(/Loading enhanced features/i)).toBeInTheDocument();
  });

  it("ARIA: outer container is a polite live region", () => {
    render(<ModelLoadIndicator mlStatus={{ segmentation: "loading" }} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("layout-reserved slot: container carries a min-height class regardless of state", () => {
    const { rerender } = render(<ModelLoadIndicator mlStatus={{}} />);
    const slot = screen.getByTestId("model-load-indicator-slot");
    expect(slot.className).toMatch(/min-h-10/);

    rerender(<ModelLoadIndicator mlStatus={{ segmentation: "loading" }} />);
    const slotLoading = screen.getByTestId("model-load-indicator-slot");
    expect(slotLoading.className).toMatch(/min-h-10/);
  });
});
