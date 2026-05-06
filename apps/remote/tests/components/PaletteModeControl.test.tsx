import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PaletteModeControl from "../../src/components/PaletteModeControl";

function defaultProps() {
  return {
    mode: "auto" as const,
    onModeChange: vi.fn(),
    curatedPaletteId: "pico-8" as const,
    onCuratedPaletteIdChange: vi.fn(),
    customPaletteText: "",
    onCustomPaletteTextChange: vi.fn(),
    onCustomPaletteParsed: vi.fn(),
  };
}

describe("PaletteModeControl", () => {
  afterEach(() => cleanup());

  it("renders three radio options grouped under Palette legend", () => {
    render(<PaletteModeControl {...defaultProps()} />);
    expect(screen.getByText("Palette")).toBeInTheDocument();
    expect(screen.getByLabelText(/Auto from image/)).toBeChecked();
    expect(screen.getByLabelText("Curated")).toBeInTheDocument();
    expect(screen.getByLabelText("Custom")).toBeInTheDocument();
  });

  it("does NOT show curated select or custom textarea when mode is auto", () => {
    render(<PaletteModeControl {...defaultProps()} />);
    expect(screen.queryByLabelText(/Curated palette/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Custom palette/)).not.toBeInTheDocument();
  });

  it("shows curated select when mode is curated", () => {
    render(<PaletteModeControl {...defaultProps()} mode="curated" />);
    expect(screen.getByLabelText(/Curated palette/)).toBeInTheDocument();
  });

  it("shows custom textarea when mode is custom", () => {
    render(<PaletteModeControl {...defaultProps()} mode="custom" />);
    expect(screen.getByLabelText(/Custom palette/)).toBeInTheDocument();
  });

  it("emits onModeChange when a radio option is clicked", () => {
    const props = defaultProps();
    render(<PaletteModeControl {...props} />);
    fireEvent.click(screen.getByLabelText("Curated"));
    expect(props.onModeChange).toHaveBeenCalledWith("curated");
  });

  it("emits onCuratedPaletteIdChange when the curated select changes", () => {
    const props = defaultProps();
    render(<PaletteModeControl {...props} mode="curated" />);
    fireEvent.change(screen.getByLabelText(/Curated palette/), { target: { value: "ega-16" } });
    expect(props.onCuratedPaletteIdChange).toHaveBeenCalledWith("ega-16");
  });

  it("calls onCustomPaletteParsed with parsed colors for valid custom input", () => {
    const props = defaultProps();
    render(<PaletteModeControl {...props} mode="custom" customPaletteText={"#ff0000\n#00ff00"} />);
    expect(props.onCustomPaletteParsed).toHaveBeenCalled();
    const lastCall = props.onCustomPaletteParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual([
      [255, 0, 0],
      [0, 255, 0],
    ]);
  });

  it("surfaces parse error via role=alert for invalid custom input", () => {
    const props = defaultProps();
    render(<PaletteModeControl {...props} mode="custom" customPaletteText="not-a-color" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid color/i);
    // onCustomPaletteParsed should be called with null on invalid input.
    const lastCall = props.onCustomPaletteParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });

  it("calls onCustomPaletteParsed with null for empty custom input", () => {
    const props = defaultProps();
    render(<PaletteModeControl {...props} mode="custom" customPaletteText="   " />);
    const lastCall = props.onCustomPaletteParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });

  it("disables the entire fieldset when disabled prop is set", () => {
    render(<PaletteModeControl {...defaultProps()} disabled />);
    const fieldset = screen.getByText("Palette").closest("fieldset");
    expect(fieldset).toBeDisabled();
  });
});
