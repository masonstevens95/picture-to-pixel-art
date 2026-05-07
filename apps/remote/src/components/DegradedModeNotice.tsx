import { useState } from "react";
import type { MLStage } from "../pipeline/protocol";
import type { MLStatusMap } from "../hooks/usePixelArtPipeline";

/**
 * Per-stage degraded-mode banner shown when an ML stage failed to load
 * or run (U8).
 *
 * Renders below the StyleSelector (sharing the layout-reserved slot with
 * `ModelLoadIndicator`; the two are mutually exclusive per stage). One
 * line of muted amber text + a dismiss button.
 *
 * Doc-review fix: dismiss state is tracked PER STAGE, not session-wide.
 * A user dismissing the segmentation banner should still see a separate
 * notice if face-landmarks subsequently fails. The dismiss persists for
 * the lifetime of the component (i.e., the page session) — re-failing
 * the same stage does NOT re-show the banner; this matches the plan's
 * "sticky-dismiss" semantics.
 *
 * Aria: `role="status"` + `aria-live="polite"` so a screen reader
 * announces the failure on first appearance.
 */

const STAGES: readonly MLStage[] = ["segmentation", "face-landmarks"];

const STAGE_COPY: Record<MLStage, string> = {
  segmentation: "Smart cutout unavailable — using basic background detection.",
  "face-landmarks":
    "Face detection unavailable — facial features won't be boosted.",
};

const STAGE_LABEL: Record<MLStage, string> = {
  segmentation: "Smart cutout",
  "face-landmarks": "Face detection",
};

export interface DegradedModeNoticeProps {
  /** Aggregated ML status map sourced from `usePixelArtPipeline`. */
  mlStatus: MLStatusMap;
}

export function DegradedModeNotice({ mlStatus }: DegradedModeNoticeProps) {
  // Per-stage dismiss tracking. Once a stage is in the set, its banner
  // stays hidden for the rest of the session even if the stage's status
  // re-flips to 'failed'.
  const [dismissedStages, setDismissedStages] = useState<Set<MLStage>>(
    () => new Set(),
  );

  const visibleStages = STAGES.filter(
    (stage) => mlStatus[stage] === "failed" && !dismissedStages.has(stage),
  );

  const dismiss = (stage: MLStage) => {
    setDismissedStages((prev) => {
      if (prev.has(stage)) return prev;
      const next = new Set(prev);
      next.add(stage);
      return next;
    });
  };

  // Always render the live region so screen readers can announce content
  // as it appears. Empty when no notices are visible.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="degraded-mode-notice-slot"
    >
      {visibleStages.map((stage) => (
        <div
          key={stage}
          data-testid={`degraded-mode-notice-${stage}`}
          className="mt-1 flex items-center justify-between gap-3 rounded-md border border-amber-900/40 bg-amber-950/30 px-3 py-2"
        >
          <p className="text-xs text-amber-300">{STAGE_COPY[stage]}</p>
          <button
            type="button"
            onClick={() => dismiss(stage)}
            aria-label={`Dismiss ${STAGE_LABEL[stage]} notice`}
            className="rounded border border-amber-900/40 px-2 py-0.5 text-xs text-amber-200 hover:border-amber-700 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

export default DegradedModeNotice;
