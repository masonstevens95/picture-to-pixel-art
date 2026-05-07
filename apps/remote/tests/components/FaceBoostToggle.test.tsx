import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import FaceBoostToggle from "../../src/components/FaceBoostToggle";

describe("FaceBoostToggle", () => {
  afterEach(() => cleanup());

  it("renders the labeled checkbox and helper copy", () => {
    render(<FaceBoostToggle enabled={false} onChange={() => undefined} />);
    expect(screen.getByLabelText(/Boost facial features/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Enhances eye, nose, and mouth contrast/i),
    ).toBeInTheDocument();
  });

  it("emits true when checked from off", () => {
    const onChange = vi.fn();
    render(<FaceBoostToggle enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Boost facial features/i));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("emits false when unchecked from on", () => {
    const onChange = vi.fn();
    render(<FaceBoostToggle enabled onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Boost facial features/i));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("reflects the enabled prop", () => {
    const { rerender } = render(<FaceBoostToggle enabled={false} onChange={() => undefined} />);
    const cbOff = screen.getByLabelText(/Boost facial features/i) as HTMLInputElement;
    expect(cbOff.checked).toBe(false);

    rerender(<FaceBoostToggle enabled onChange={() => undefined} />);
    const cbOn = screen.getByLabelText(/Boost facial features/i) as HTMLInputElement;
    expect(cbOn.checked).toBe(true);
  });

  it("disables the checkbox when disabled prop is set", () => {
    render(<FaceBoostToggle enabled={false} onChange={() => undefined} disabled />);
    expect(screen.getByLabelText(/Boost facial features/i)).toBeDisabled();
  });

  it("when mlAvailable=false, the checkbox is disabled and shows the descriptive copy", () => {
    render(
      <FaceBoostToggle enabled={false} onChange={() => undefined} mlAvailable={false} />,
    );
    expect(screen.getByLabelText(/Boost facial features/i)).toBeDisabled();
    expect(
      screen.getByText(/Loading face detection failed/i),
    ).toBeInTheDocument();
  });

  it("when mlAvailable=true (default), the checkbox is enabled (with no image yet, only `disabled` would gate it)", () => {
    render(<FaceBoostToggle enabled={false} onChange={() => undefined} />);
    expect(screen.getByLabelText(/Boost facial features/i)).not.toBeDisabled();
  });

  it("ARIA: when mlAvailable=false, the checkbox is described by the help text id", () => {
    render(
      <FaceBoostToggle enabled={false} onChange={() => undefined} mlAvailable={false} />,
    );
    const cb = screen.getByLabelText(/Boost facial features/i);
    expect(cb).toHaveAttribute("aria-describedby", "face-boost-help");
    // And the help element exists with the matching id.
    expect(document.getElementById("face-boost-help")).not.toBeNull();
  });

  it("ARIA: when mlAvailable=true (default), no aria-describedby is set", () => {
    render(<FaceBoostToggle enabled={false} onChange={() => undefined} />);
    const cb = screen.getByLabelText(/Boost facial features/i);
    expect(cb).not.toHaveAttribute("aria-describedby");
  });
});
