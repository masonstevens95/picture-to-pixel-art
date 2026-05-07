import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SilhouetteControl from "../../src/components/SilhouetteControl";

describe("SilhouetteControl", () => {
  afterEach(() => cleanup());

  it("renders the toggle, tolerance slider, and helper copy", () => {
    render(
      <SilhouetteControl
        enabled={false}
        tolerance={12}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Remove background")).toBeInTheDocument();
    expect(screen.getByLabelText("Background tolerance")).toBeInTheDocument();
    expect(screen.getByText(/Works best on photos with a clean/)).toBeInTheDocument();
  });

  it("emits enabled=true when toggle is checked", () => {
    const onEnabledChange = vi.fn();
    render(
      <SilhouetteControl
        enabled={false}
        tolerance={12}
        onEnabledChange={onEnabledChange}
        onToleranceChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove background"));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("emits new tolerance when slider changes", () => {
    const onToleranceChange = vi.fn();
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        onEnabledChange={() => undefined}
        onToleranceChange={onToleranceChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Background tolerance"), { target: { value: "25" } });
    expect(onToleranceChange).toHaveBeenCalledWith(25);
  });

  it("disables tolerance slider when not enabled", () => {
    render(
      <SilhouetteControl
        enabled={false}
        tolerance={12}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Background tolerance")).toBeDisabled();
  });

  it("disables the entire fieldset when disabled prop is set", () => {
    const { container } = render(
      <SilhouetteControl
        enabled
        tolerance={12}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        disabled
      />,
    );
    expect(container.querySelector("fieldset")).toBeDisabled();
  });

  it("shows the current tolerance value as a numeric readout", () => {
    render(
      <SilhouetteControl
        enabled
        tolerance={18}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
      />,
    );
    expect(screen.getByText("18")).toBeInTheDocument();
  });
});
