import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OutlineControl from "../../src/components/OutlineControl";

const DEFAULT_VALUE = { enabled: false, width: 1, color: [0, 0, 0] as [number, number, number] };

describe("OutlineControl", () => {
  afterEach(() => cleanup());

  it("renders the legend, checkbox, width select, and color picker", () => {
    render(<OutlineControl value={DEFAULT_VALUE} onChange={() => undefined} />);
    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable outline")).toBeInTheDocument();
    expect(screen.getByLabelText("Outline color")).toBeInTheDocument();
  });

  it("emits onChange with enabled=true when the checkbox is checked", () => {
    const onChange = vi.fn();
    render(<OutlineControl value={DEFAULT_VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Enable outline"));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VALUE, enabled: true });
  });

  it("emits onChange with the new width when the width select changes", () => {
    const onChange = vi.fn();
    render(
      <OutlineControl value={{ ...DEFAULT_VALUE, enabled: true }} onChange={onChange} />,
    );
    const widthSelect = screen.getAllByRole("combobox")[0]!;
    fireEvent.change(widthSelect, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, width: 3 }),
    );
  });

  it("emits onChange with the new color when the color picker changes", () => {
    const onChange = vi.fn();
    render(
      <OutlineControl value={{ ...DEFAULT_VALUE, enabled: true }} onChange={onChange} />,
    );
    fireEvent.input(screen.getByLabelText("Outline color"), {
      target: { value: "#ff0000" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ color: [255, 0, 0] }),
    );
  });

  it("disables width and color sub-controls when enabled=false", () => {
    render(<OutlineControl value={DEFAULT_VALUE} onChange={() => undefined} />);
    expect(screen.getAllByRole("combobox")[0]!).toBeDisabled();
    expect(screen.getByLabelText("Outline color")).toBeDisabled();
  });

  it("disables the entire fieldset when disabled prop is set", () => {
    const { container } = render(
      <OutlineControl value={DEFAULT_VALUE} onChange={() => undefined} disabled />,
    );
    expect(container.querySelector("fieldset")).toBeDisabled();
  });
});
