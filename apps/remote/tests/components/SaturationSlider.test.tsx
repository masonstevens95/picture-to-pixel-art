import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SaturationSlider from "../../src/components/SaturationSlider";

describe("SaturationSlider", () => {
  afterEach(() => cleanup());

  it("renders the labelled control with formatted value at zero", () => {
    render(<SaturationSlider value={0} onChange={() => undefined} />);
    expect(screen.getByLabelText(/Saturation/)).toBeInTheDocument();
    expect(screen.getByText("0.00")).toBeInTheDocument();
  });

  it("formats positive and negative values with explicit sign", () => {
    const { rerender } = render(<SaturationSlider value={0.4} onChange={() => undefined} />);
    expect(screen.getByText("+0.40")).toBeInTheDocument();
    rerender(<SaturationSlider value={-0.3} onChange={() => undefined} />);
    expect(screen.getByText("-0.30")).toBeInTheDocument();
  });

  it("emits the next numeric value on change", () => {
    const onChange = vi.fn();
    render(<SaturationSlider value={0} onChange={onChange} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.5" } });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("exposes ARIA value range and value text", () => {
    render(<SaturationSlider value={0.25} onChange={() => undefined} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuemin", "-1");
    expect(slider).toHaveAttribute("aria-valuemax", "1");
    expect(slider).toHaveAttribute("aria-valuenow", "0.25");
    expect(slider).toHaveAttribute("aria-valuetext", "+0.25 saturation");
  });

  it("disables the slider when prop is set", () => {
    render(<SaturationSlider value={0} onChange={() => undefined} disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
