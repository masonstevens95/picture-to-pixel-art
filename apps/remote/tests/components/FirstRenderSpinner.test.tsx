import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import FirstRenderSpinner from "../../src/components/FirstRenderSpinner";

describe("FirstRenderSpinner", () => {
  afterEach(() => cleanup());

  it("renders nothing when active=false", () => {
    render(<FirstRenderSpinner active={false} />);
    expect(screen.queryByTestId("first-render-spinner")).not.toBeInTheDocument();
  });

  it("renders the spinner and caption when active=true", () => {
    render(<FirstRenderSpinner active />);
    expect(screen.getByTestId("first-render-spinner")).toBeInTheDocument();
    expect(screen.getByText(/Processing image…/)).toBeInTheDocument();
  });

  it("ARIA: role=status with aria-label='Processing image'", () => {
    render(<FirstRenderSpinner active />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-label", "Processing image");
  });

  it("positions absolutely (overlay only the parent result pane, not the source)", () => {
    // The overlay relies on `absolute inset-0` to cover its positioned
    // ancestor. Asserting the class set documents the contract: callers
    // place the spinner inside a `position: relative` container that is
    // bounded by the result pane, so it never bleeds onto the source.
    render(<FirstRenderSpinner active />);
    const overlay = screen.getByTestId("first-render-spinner");
    expect(overlay.className).toMatch(/absolute/);
    expect(overlay.className).toMatch(/inset-0/);
  });
});
