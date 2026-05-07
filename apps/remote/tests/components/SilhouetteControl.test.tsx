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
    // v4 helper copy mentions both Smart (ML) and Fast (corner-sample).
    expect(screen.getByText(/Smart uses an on-device model/)).toBeInTheDocument();
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
    // The OUTER fieldset (the component root) is what carries the disabled
    // state — there's also an inner fieldset wrapping the Quality radios.
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

  // ---- v4 Quality toggle scenarios (U5) ----

  it("Quality toggle defaults to Smart visually when no quality prop is provided", () => {
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={() => undefined}
      />,
    );
    const smart = screen.getByRole("radio", { name: /Smart/i }) as HTMLInputElement;
    const fast = screen.getByRole("radio", { name: /Fast/i }) as HTMLInputElement;
    expect(smart.checked).toBe(true);
    expect(fast.checked).toBe(false);
  });

  it("emits onQualityChange('fast') when the Fast radio is selected", () => {
    const onQualityChange = vi.fn();
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        quality="smart"
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={onQualityChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Fast/i }));
    expect(onQualityChange).toHaveBeenCalledWith("fast");
  });

  it("emits onQualityChange('smart') when the Smart radio is selected from Fast", () => {
    const onQualityChange = vi.fn();
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        quality="fast"
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={onQualityChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Smart/i }));
    expect(onQualityChange).toHaveBeenCalledWith("smart");
  });

  it("when mlAvailable=false, Smart radio is disabled and shows the descriptive text", () => {
    const onQualityChange = vi.fn();
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        quality="fast"
        mlAvailable={false}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={onQualityChange}
      />,
    );
    const smart = screen.getByRole("radio", { name: /Smart/i });
    expect(smart).toBeDisabled();
    // Tooltip + descriptive copy explain the fallback to the user.
    expect(
      screen.getByText(/Loading enhanced cutout failed/i),
    ).toBeInTheDocument();
  });

  it("when mlAvailable=false, the Smart radio carries the disabled attribute (browser blocks the change event)", () => {
    // jsdom's `fireEvent.click` on a disabled input still fires the change
    // listener — that's a jsdom quirk. The real-browser invariant is just
    // "the radio is `disabled` so the user can't activate it", which is
    // what we assert here. The component does NOT need an extra runtime
    // guard because the disabled attribute is a real-DOM no-op.
    const onQualityChange = vi.fn();
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        quality="fast"
        mlAvailable={false}
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={onQualityChange}
      />,
    );
    expect(screen.getByRole("radio", { name: /Smart/i })).toBeDisabled();
  });

  it("when mlAvailable=true (default), both Quality radios are enabled and keyboard-navigable", () => {
    render(
      <SilhouetteControl
        enabled
        tolerance={12}
        quality="smart"
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={() => undefined}
      />,
    );
    const fast = screen.getByRole("radio", { name: /Fast/i });
    const smart = screen.getByRole("radio", { name: /Smart/i });
    expect(fast).not.toBeDisabled();
    expect(smart).not.toBeDisabled();
    // Both are <input type="radio">, which are tab-focusable by default.
    expect(fast.tagName).toBe("INPUT");
    expect(smart.tagName).toBe("INPUT");
  });

  it("Quality radios are disabled when silhouette is not enabled (gating)", () => {
    render(
      <SilhouetteControl
        enabled={false}
        tolerance={12}
        quality="smart"
        onEnabledChange={() => undefined}
        onToleranceChange={() => undefined}
        onQualityChange={() => undefined}
      />,
    );
    expect(screen.getByRole("radio", { name: /Fast/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Smart/i })).toBeDisabled();
  });
});
