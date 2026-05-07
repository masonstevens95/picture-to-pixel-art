import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StyleSelector from "../../src/components/StyleSelector";

function defaults() {
  return {
    value: "custom" as const,
    previousFilter: null,
    onPickFilter: vi.fn(),
    onPickCustom: vi.fn(),
    onReset: vi.fn(),
  };
}

describe("StyleSelector", () => {
  afterEach(() => cleanup());

  it("renders all 6 options (Custom + 5 filters)", () => {
    render(<StyleSelector {...defaults()} />);
    expect(screen.getByRole("option", { name: "Custom" })).toBeInTheDocument();
    for (const name of ["Art piece", "Portrait", "Units", "Asset", "Environment"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("emits onPickFilter when a filter is selected", () => {
    const props = defaults();
    render(<StyleSelector {...props} />);
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "units" } });
    expect(props.onPickFilter).toHaveBeenCalledWith("units");
  });

  it("emits onPickCustom when Custom is selected", () => {
    const props = defaults();
    render(<StyleSelector {...props} value="units" />);
    fireEvent.change(screen.getByLabelText("Style"), { target: { value: "custom" } });
    expect(props.onPickCustom).toHaveBeenCalled();
  });

  it("hides 'Custom (was: X)' indicator when previousFilter is null", () => {
    render(<StyleSelector {...defaults()} />);
    expect(screen.queryByText(/was:/)).not.toBeInTheDocument();
  });

  it("shows 'Custom (was: Units)' indicator + Reset button when value=custom and previousFilter set", () => {
    render(<StyleSelector {...defaults()} previousFilter="units" />);
    expect(screen.getByText(/was: Units/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset to Units/ })).toBeInTheDocument();
  });

  it("hides indicator when an actual filter is currently selected", () => {
    render(<StyleSelector {...defaults()} value="units" previousFilter="units" />);
    expect(screen.queryByText(/was:/)).not.toBeInTheDocument();
  });

  it("emits onReset when Reset button is clicked", () => {
    const props = defaults();
    render(<StyleSelector {...props} previousFilter="units" />);
    fireEvent.click(screen.getByRole("button", { name: /Reset to Units/ }));
    expect(props.onReset).toHaveBeenCalled();
  });

  it("indicator is wrapped in a polite live region for screen readers", () => {
    render(<StyleSelector {...defaults()} previousFilter="units" />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });
});
