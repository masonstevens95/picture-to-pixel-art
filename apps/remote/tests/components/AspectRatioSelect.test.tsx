import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AspectRatioSelect from "../../src/components/AspectRatioSelect";

describe("AspectRatioSelect", () => {
  afterEach(() => cleanup());

  it("starts at Source when value is undefined and emits undefined for Source", () => {
    const onChange = vi.fn();
    render(<AspectRatioSelect value={undefined} onChange={onChange} />);
    const select = screen.getByLabelText(/Aspect ratio/) as HTMLSelectElement;
    expect(select.value).toBe("source");
  });

  it("emits numeric ratio 1 when Square is chosen", () => {
    const onChange = vi.fn();
    render(<AspectRatioSelect value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Aspect ratio/), { target: { value: "square" } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("emits 4/3 for Landscape and 3/4 for Portrait", () => {
    const onChange = vi.fn();
    render(<AspectRatioSelect value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Aspect ratio/), { target: { value: "landscape" } });
    expect(onChange).toHaveBeenLastCalledWith(4 / 3);
    fireEvent.change(screen.getByLabelText(/Aspect ratio/), { target: { value: "portrait" } });
    expect(onChange).toHaveBeenLastCalledWith(3 / 4);
  });

  it("reveals W and H inputs when Custom is selected and emits W/H ratio", () => {
    const onChange = vi.fn();
    render(<AspectRatioSelect value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Aspect ratio/), { target: { value: "custom" } });
    expect(screen.getByLabelText(/Custom aspect width/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom aspect height/)).toBeInTheDocument();

    // Defaults are 16 and 9; switching to Custom should already emit 16/9.
    expect(onChange).toHaveBeenCalledWith(16 / 9);

    fireEvent.change(screen.getByLabelText(/Custom aspect height/), { target: { value: "10" } });
    expect(onChange).toHaveBeenLastCalledWith(16 / 10);
  });

  it("surfaces an inline error when custom W or H is zero or non-positive", () => {
    const onChange = vi.fn();
    render(<AspectRatioSelect value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Aspect ratio/), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText(/Custom aspect width/), { target: { value: "0" } });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // The last positive emission was the initial 16/9 (from selecting Custom);
    // 0 should NOT produce a new emission.
    expect(onChange).toHaveBeenLastCalledWith(16 / 9);
  });

  it("disables the select and inputs when disabled prop is set", () => {
    render(<AspectRatioSelect value={1} onChange={() => undefined} disabled />);
    expect(screen.getByLabelText(/Aspect ratio/)).toBeDisabled();
  });
});
