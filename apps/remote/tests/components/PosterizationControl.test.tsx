import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PosterizationControl from "../../src/components/PosterizationControl";

describe("PosterizationControl", () => {
  afterEach(() => cleanup());

  it("renders the legend, toggle, and bands select", () => {
    render(<PosterizationControl bands={undefined} onChange={() => undefined} />);
    expect(screen.getByText("Posterization")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable posterization")).toBeInTheDocument();
    expect(screen.getByLabelText("Posterization bands")).toBeInTheDocument();
  });

  it("checkbox unchecked when bands=undefined", () => {
    render(<PosterizationControl bands={undefined} onChange={() => undefined} />);
    expect(screen.getByLabelText("Enable posterization")).not.toBeChecked();
  });

  it("checkbox checked when bands is set", () => {
    render(<PosterizationControl bands={4} onChange={() => undefined} />);
    expect(screen.getByLabelText("Enable posterization")).toBeChecked();
  });

  it("emits bands=4 when enabling (default-on)", () => {
    const onChange = vi.fn();
    render(<PosterizationControl bands={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Enable posterization"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("emits undefined when disabling", () => {
    const onChange = vi.fn();
    render(<PosterizationControl bands={4} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Enable posterization"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("emits new bands value when select changes", () => {
    const onChange = vi.fn();
    render(<PosterizationControl bands={4} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Posterization bands"), { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("includes band value 7 in the dropdown (origin spec is 2-8)", () => {
    render(<PosterizationControl bands={4} onChange={() => undefined} />);
    const options = Array.from(
      screen.getByLabelText("Posterization bands").querySelectorAll("option"),
    ).map((o) => o.value);
    expect(options).toContain("7");
    expect(options).toEqual(["2", "3", "4", "5", "6", "7", "8"]);
  });

  it("bands select disabled when posterization is off", () => {
    render(<PosterizationControl bands={undefined} onChange={() => undefined} />);
    expect(screen.getByLabelText("Posterization bands")).toBeDisabled();
  });

  it("disables the entire fieldset when disabled prop is set", () => {
    const { container } = render(
      <PosterizationControl bands={4} onChange={() => undefined} disabled />,
    );
    expect(container.querySelector("fieldset")).toBeDisabled();
  });
});
