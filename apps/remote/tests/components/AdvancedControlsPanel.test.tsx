import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AdvancedControlsPanel from "../../src/components/AdvancedControlsPanel";

describe("AdvancedControlsPanel", () => {
  afterEach(() => cleanup());

  it("renders closed by default with the summary visible", () => {
    render(
      <AdvancedControlsPanel>
        <div data-testid="child">child</div>
      </AdvancedControlsPanel>,
    );
    const panel = screen.getByText("Advanced controls").closest("details");
    expect(panel).toBeInTheDocument();
    expect(panel).not.toHaveAttribute("open");
  });

  it("renders children inside the panel body", () => {
    render(
      <AdvancedControlsPanel defaultOpen>
        <div data-testid="child">child</div>
      </AdvancedControlsPanel>,
    );
    const panel = screen.getByText("Advanced controls").closest("details");
    expect(panel).toHaveAttribute("open");
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders without crashing when children is empty", () => {
    render(<AdvancedControlsPanel>{null}</AdvancedControlsPanel>);
    expect(screen.getByText("Advanced controls")).toBeInTheDocument();
  });
});
