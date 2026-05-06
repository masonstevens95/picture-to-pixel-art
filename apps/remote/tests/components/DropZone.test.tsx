import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DropZone from "../../src/components/DropZone";

function makeFile(name: string, type: string, contents = "x"): File {
  return new File([contents], name, { type });
}

describe("DropZone", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the idle prompt and accessible role", () => {
    render(<DropZone onChange={() => undefined} />);
    const zone = screen.getByRole("button");
    expect(zone).toHaveAttribute("aria-label", expect.stringContaining("Upload"));
    expect(screen.getByText("Drop a photo here, or click to choose")).toBeInTheDocument();
  });

  it("fires onChange when a valid image is dropped", () => {
    const onChange = vi.fn();
    render(<DropZone onChange={onChange} />);
    const zone = screen.getByRole("button");
    const file = makeFile("photo.jpg", "image/jpeg");

    fireEvent.drop(zone, {
      dataTransfer: { files: [file], items: [{ kind: "file", type: "image/jpeg" }] },
    });

    expect(onChange).toHaveBeenCalledWith(file);
  });

  it("shows an inline error and does not fire onChange for non-image drops", () => {
    const onChange = vi.fn();
    render(<DropZone onChange={onChange} />);
    const zone = screen.getByRole("button");
    const file = makeFile("notes.txt", "text/plain");

    fireEvent.drop(zone, {
      dataTransfer: { files: [file], items: [{ kind: "file", type: "text/plain" }] },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("doesn't look like an image");
  });

  it("dismisses the error when the user clicks the dismiss button", () => {
    render(<DropZone onChange={() => undefined} />);
    const zone = screen.getByRole("button", { name: /Upload/ });
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile("a.txt", "text/plain")], items: [] },
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the file picker on Enter or Space when focused", () => {
    render(<DropZone onChange={() => undefined} />);
    const zone = screen.getByRole("button");
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.keyDown(zone, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(zone, { key: " " });
    expect(clickSpy).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(zone, { key: "a" });
    expect(clickSpy).toHaveBeenCalledTimes(2); // unchanged
  });

  it("ignores drops while disabled", () => {
    const onChange = vi.fn();
    render(<DropZone onChange={onChange} disabled />);
    const zone = screen.getByRole("button");
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile("a.png", "image/png")], items: [] },
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
