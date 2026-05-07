/**
 * Result-pane spinner for the heavy first render of a new source (U8).
 *
 * Visibility tied to `firstRenderActive` from `usePixelArtPipeline`. The
 * spinner overlays ONLY the result pane (not the source pane) — the user
 * still sees their dropped image alongside the spinner so they know the
 * file was accepted. This is the doc-review fix on the plan's original
 * "overlay the result pane" wording.
 *
 * Position: absolute inside the result pane container in
 * `SideBySidePreview`. The component itself is layout-agnostic; the
 * caller is responsible for positioning. We render a centered spinner
 * + caption inside a translucent backdrop that dims any prior result.
 *
 * ARIA: `role="status"` with `aria-label="Processing image"` (no
 * aria-live — the spinner is a transient visual cue; the surrounding
 * polite live region in PixelArtApp announces "Converting image" on
 * status transitions, so aria-live here would be redundant noise).
 */

export interface FirstRenderSpinnerProps {
  /** When false, render nothing. */
  active: boolean;
}

export function FirstRenderSpinner({ active }: FirstRenderSpinnerProps) {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-label="Processing image"
      data-testid="first-render-spinner"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/60 backdrop-blur-[1px]"
    >
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-400"
      />
      <p className="text-xs text-neutral-300">Processing image…</p>
    </div>
  );
}

export default FirstRenderSpinner;
