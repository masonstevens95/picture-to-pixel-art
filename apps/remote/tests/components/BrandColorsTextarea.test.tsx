import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BrandColorsTextarea from "../../src/components/BrandColorsTextarea";

function defaults() {
  return {
    text: "",
    onTextChange: vi.fn(),
    onParsed: vi.fn(),
  };
}

describe("BrandColorsTextarea", () => {
  afterEach(() => cleanup());

  it("renders the labelled textarea with helper copy", () => {
    render(<BrandColorsTextarea {...defaults()} />);
    expect(screen.getByLabelText(/Brand colors/)).toBeInTheDocument();
    expect(screen.getByText(/Hex codes that must appear/)).toBeInTheDocument();
  });

  it("calls onParsed with parsed colors for valid input", () => {
    const props = defaults();
    render(<BrandColorsTextarea {...props} text={"#ff0000\n#00ff00"} />);
    const lastCall = props.onParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual([
      [255, 0, 0],
      [0, 255, 0],
    ]);
  });

  it("calls onParsed with null and surfaces alert for invalid input", () => {
    const props = defaults();
    render(<BrandColorsTextarea {...props} text="not-a-color" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const lastCall = props.onParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });

  it("calls onParsed with null for empty/whitespace input", () => {
    const props = defaults();
    render(<BrandColorsTextarea {...props} text="   " />);
    const lastCall = props.onParsed.mock.calls.at(-1)?.[0];
    expect(lastCall).toBeNull();
  });

  it("emits onTextChange when the textarea content changes", () => {
    const props = defaults();
    render(<BrandColorsTextarea {...props} />);
    const textarea = screen.getByLabelText(/Brand colors/);
    fireEvent.change(textarea, { target: { value: "#abcdef" } });
    expect(props.onTextChange).toHaveBeenCalledWith("#abcdef");
  });

  it("shows the merge UX hint when paletteOverridden is true and there is non-empty input", () => {
    render(
      <BrandColorsTextarea {...defaults()} text="#ff0000" paletteOverridden />,
    );
    expect(screen.getByText(/Brand colors merge with the active palette/)).toBeInTheDocument();
  });

  it("does NOT show the merge hint when paletteOverridden is false", () => {
    render(
      <BrandColorsTextarea {...defaults()} text="#ff0000" paletteOverridden={false} />,
    );
    expect(screen.queryByText(/Brand colors merge with the active palette/)).not.toBeInTheDocument();
  });

  it("does NOT show the merge hint when input is empty (even if paletteOverridden=true)", () => {
    render(<BrandColorsTextarea {...defaults()} text="" paletteOverridden />);
    expect(screen.queryByText(/Brand colors merge with the active palette/)).not.toBeInTheDocument();
  });

  it("disables the textarea when disabled prop is set", () => {
    render(<BrandColorsTextarea {...defaults()} disabled />);
    expect(screen.getByLabelText(/Brand colors/)).toBeDisabled();
  });
});
