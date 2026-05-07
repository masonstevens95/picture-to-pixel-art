import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResolutionSlider from "../../src/components/ResolutionSlider";

describe("ResolutionSlider", () => {
  afterEach(() => cleanup());

  it("renders the current value and discrete stop labels", () => {
    render(<ResolutionSlider value={64} onChange={() => undefined} />);
    expect(screen.getByLabelText(/Output resolution/i)).toBeInTheDocument();
    expect(screen.getByText("64 px")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("256")).toBeInTheDocument();
  });

  it("emits the next discrete stop when value changes", () => {
    const onChange = vi.fn();
    render(<ResolutionSlider value={32} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    // v3 indexing: [16, 32, 48, 64, 96, 128, 192, 256] — index 5 → 128.
    fireEvent.change(slider, { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith(128);
  });

  it("exposes ARIA value/text reflecting the underlying px stop", () => {
    render(<ResolutionSlider value={128} onChange={() => undefined} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuemin", "16");
    expect(slider).toHaveAttribute("aria-valuemax", "256");
    expect(slider).toHaveAttribute("aria-valuenow", "128");
    expect(slider).toHaveAttribute("aria-valuetext", "128 pixels");
  });

  it("disables the slider when prop is set", () => {
    render(<ResolutionSlider value={64} onChange={() => undefined} disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
