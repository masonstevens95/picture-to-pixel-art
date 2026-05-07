import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PaletteSizeControl, {
  PALETTE_SIZE_OPTIONS,
} from "../../src/components/PaletteSizeControl";

describe("PaletteSizeControl", () => {
  afterEach(() => cleanup());

  it("renders all 8 discrete options", () => {
    render(<PaletteSizeControl paletteSize={16} onChange={() => undefined} />);
    expect(screen.getByLabelText("Palette size")).toBeInTheDocument();
    for (const n of PALETTE_SIZE_OPTIONS) {
      expect(screen.getByRole("option", { name: `${n} colors` })).toBeInTheDocument();
    }
  });

  it("emits new size on change", () => {
    const onChange = vi.fn();
    render(<PaletteSizeControl paletteSize={16} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Palette size"), { target: { value: "48" } });
    expect(onChange).toHaveBeenCalledWith(48);
  });

  it("reflects current value in the dropdown", () => {
    render(<PaletteSizeControl paletteSize={48} onChange={() => undefined} />);
    expect((screen.getByLabelText("Palette size") as HTMLSelectElement).value).toBe("48");
  });

  it("disables when prop is set", () => {
    render(<PaletteSizeControl paletteSize={16} onChange={() => undefined} disabled />);
    expect(screen.getByLabelText("Palette size")).toBeDisabled();
  });
});
