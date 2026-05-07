import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ChunkyPixelsControl from "../../src/components/ChunkyPixelsControl";

describe("ChunkyPixelsControl", () => {
  afterEach(() => cleanup());

  it("renders dropdown with all 4 options including the labeled default", () => {
    render(<ChunkyPixelsControl chunkSize={1} onChange={() => undefined} />);
    expect(screen.getByLabelText("Chunky pixels")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1× (default)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2×" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3×" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "4×" })).toBeInTheDocument();
  });

  it("emits new chunk size on change", () => {
    const onChange = vi.fn();
    render(<ChunkyPixelsControl chunkSize={1} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Chunky pixels"), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("reflects current value in the dropdown", () => {
    render(<ChunkyPixelsControl chunkSize={2} onChange={() => undefined} />);
    expect((screen.getByLabelText("Chunky pixels") as HTMLSelectElement).value).toBe("2");
  });

  it("disables the dropdown when prop is set", () => {
    render(<ChunkyPixelsControl chunkSize={1} onChange={() => undefined} disabled />);
    expect(screen.getByLabelText("Chunky pixels")).toBeDisabled();
  });
});
