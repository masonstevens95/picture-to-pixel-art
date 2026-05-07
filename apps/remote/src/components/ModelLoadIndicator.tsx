import type { MLStage } from "../pipeline/protocol";
import type { MLStatusMap } from "../hooks/usePixelArtPipeline";

/**
 * Compact "Loading enhanced features…" indicator (U8).
 *
 * Renders below the StyleSelector when ANY ML stage (segmentation OR face
 * landmarks) is in the 'loading' phase. Hidden once every loading stage has
 * transitioned to 'ready' (or 'failed', in which case `DegradedModeNotice`
 * takes over the same visual slot).
 *
 * Doc-review fix: the component reserves vertical space at all times so a
 * stage transitioning loading -> ready does not jitter the layout. The
 * outer wrapper carries `min-h-10` regardless of state; only the inner
 * panel toggles visibility.
 *
 * Aria-live region: `role="status"` + `aria-live="polite"` so a screen
 * reader announces the loading state without interrupting other speech.
 */

export interface ModelLoadIndicatorProps {
  /** Aggregated ML status map sourced from `usePixelArtPipeline`. */
  mlStatus: MLStatusMap;
}

const STAGES: readonly MLStage[] = ["segmentation", "face-landmarks"];

export function ModelLoadIndicator({ mlStatus }: ModelLoadIndicatorProps) {
  const isLoading = STAGES.some((stage) => mlStatus[stage] === "loading");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // Reserved-slot height: identical whether loading or not so layout
      // doesn't shift. Tailwind `min-h-10` (~40px) accommodates the text
      // line + progress bar + vertical padding.
      className="min-h-10"
      data-testid="model-load-indicator-slot"
    >
      {isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2">
          <span className="text-xs text-neutral-300">Loading enhanced features…</span>
          {/* Indeterminate progress bar: a CSS-animated gradient sliver
              traversing a track. Pure CSS, no library. The track has a
              fixed width so it doesn't shrink at narrow viewports. */}
          <div
            aria-hidden="true"
            className="relative h-1 w-32 overflow-hidden rounded-full bg-neutral-800"
          >
            <div className="absolute inset-y-0 left-0 w-1/3 animate-[modelLoadShimmer_1.2s_ease-in-out_infinite] rounded-full bg-emerald-400/70" />
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelLoadIndicator;
