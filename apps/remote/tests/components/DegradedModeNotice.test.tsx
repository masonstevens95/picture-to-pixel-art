import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DegradedModeNotice from "../../src/components/DegradedModeNotice";
import type { MLStatusMap } from "../../src/hooks/usePixelArtPipeline";

describe("DegradedModeNotice", () => {
  afterEach(() => cleanup());

  it("renders the segmentation copy when segmentation status is failed", () => {
    const status: MLStatusMap = { segmentation: "failed" };
    render(<DegradedModeNotice mlStatus={status} />);
    expect(
      screen.getByText(/Smart cutout unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders the face-landmarks copy when face-landmarks status is failed", () => {
    const status: MLStatusMap = { "face-landmarks": "failed" };
    render(<DegradedModeNotice mlStatus={status} />);
    expect(
      screen.getByText(/Face detection unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders nothing inside the live region when no stage failed", () => {
    render(<DegradedModeNotice mlStatus={{ segmentation: "loading" }} />);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("dismiss button hides the notice for that stage", () => {
    const status: MLStatusMap = { segmentation: "failed" };
    render(<DegradedModeNotice mlStatus={status} />);
    expect(screen.getByText(/Smart cutout unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Dismiss Smart cutout/i));
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();
  });

  it("sticky-dismiss per stage: dismissing segmentation does not hide a face-landmarks notice", () => {
    const status: MLStatusMap = {
      segmentation: "failed",
      "face-landmarks": "failed",
    };
    render(<DegradedModeNotice mlStatus={status} />);
    // Both visible.
    expect(screen.getByText(/Smart cutout unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Face detection unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Dismiss Smart cutout/i));
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();
    // Face-landmarks notice unaffected.
    expect(screen.getByText(/Face detection unavailable/i)).toBeInTheDocument();
  });

  it("sticky-dismiss per stage: a dismissed stage stays hidden when its status re-flips to failed in the same session", () => {
    const status: MLStatusMap = { segmentation: "failed" };
    const { rerender } = render(<DegradedModeNotice mlStatus={status} />);
    fireEvent.click(screen.getByLabelText(/Dismiss Smart cutout/i));
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();

    // Status transitions away…
    rerender(<DegradedModeNotice mlStatus={{ segmentation: "ready" }} />);
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();
    // …then back to failed. Dismiss should remain sticky.
    rerender(<DegradedModeNotice mlStatus={{ segmentation: "failed" }} />);
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();
  });

  it("sticky-dismiss is per-stage: dismissing segmentation, then face-landmarks fails, the new notice IS shown", () => {
    const { rerender } = render(
      <DegradedModeNotice mlStatus={{ segmentation: "failed" }} />,
    );
    fireEvent.click(screen.getByLabelText(/Dismiss Smart cutout/i));
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();

    rerender(
      <DegradedModeNotice
        mlStatus={{ segmentation: "failed", "face-landmarks": "failed" }}
      />,
    );
    // Segmentation still hidden (sticky). Face-landmarks now visible.
    expect(screen.queryByText(/Smart cutout unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Face detection unavailable/i)).toBeInTheDocument();
  });

  it("ARIA: outer container is a polite live region", () => {
    render(<DegradedModeNotice mlStatus={{ segmentation: "failed" }} />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
