import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SmoothnessControl from "../../src/components/SmoothnessControl";

describe("SmoothnessControl", () => {
  afterEach(() => cleanup());

  it("renders dropdown with all 4 options including the labeled default", () => {
    render(<SmoothnessControl value="off" onChange={() => undefined} />);
    expect(screen.getByLabelText("Smoothness")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Off (default)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Low" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Medium" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "High" })).toBeInTheDocument();
  });

  it("emits the new smoothness value on change", () => {
    const onChange = vi.fn();
    render(<SmoothnessControl value="off" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Smoothness"), { target: { value: "medium" } });
    expect(onChange).toHaveBeenCalledWith("medium");
  });

  it("reflects the current value in the dropdown", () => {
    render(<SmoothnessControl value="high" onChange={() => undefined} />);
    expect((screen.getByLabelText("Smoothness") as HTMLSelectElement).value).toBe("high");
  });

  it("disables the dropdown when the prop is set, and still includes all four options", () => {
    render(<SmoothnessControl value="off" onChange={() => undefined} disabled />);
    const select = screen.getByLabelText("Smoothness") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(select.options.length).toBe(4);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["off", "low", "medium", "high"]);
  });

  it("associates the label with the select via htmlFor/id", () => {
    render(<SmoothnessControl value="off" onChange={() => undefined} />);
    // getByLabelText only succeeds if the label/select are properly linked.
    const select = screen.getByLabelText("Smoothness");
    expect(select.tagName).toBe("SELECT");
    expect(select.id).toBe("smoothness-select");
  });
});
