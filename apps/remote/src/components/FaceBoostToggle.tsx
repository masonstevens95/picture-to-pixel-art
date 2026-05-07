import { type ChangeEvent } from "react";

/**
 * Face-aware contrast-boost toggle (U6).
 *
 * Single checkbox: when on, the worker runs MediaPipe face landmarks and
 * applies the U6 contrast boost in 16×16 windows around eyes / nose /
 * mouth. Off (the v3 invariant default) skips the entire stage — no
 * MediaPipe load, no detection pass.
 *
 * `mlAvailable=false` disables Smart-style with an inline tooltip,
 * mirroring the SilhouetteControl ML-failed UX pattern. The component
 * does NOT auto-flip the value when ML becomes unavailable; the worker's
 * R12 gate already handles the runtime fallback (face boost short-
 * circuits to identity on null landmarks). The toggle just communicates
 * "this knob can't help right now."
 */

export interface FaceBoostToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /**
   * Whether the MediaPipe face-landmarker is available. Defaults true.
   * When false, the toggle is disabled and shows a tooltip explaining
   * the fallback. The worker handles the actual no-op at dispatch time.
   */
  mlAvailable?: boolean;
  disabled?: boolean;
}

const ML_UNAVAILABLE_TITLE =
  "Loading face detection failed — facial features won't be boosted.";

export function FaceBoostToggle({
  enabled,
  onChange,
  mlAvailable = true,
  disabled = false,
}: FaceBoostToggleProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const toggleDisabled = disabled || !mlAvailable;

  return (
    <div className="space-y-2">
      <label
        className="flex items-center gap-2 text-sm text-neutral-200"
        title={!mlAvailable ? ML_UNAVAILABLE_TITLE : undefined}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleChange}
          disabled={toggleDisabled}
          aria-describedby={!mlAvailable ? "face-boost-help" : undefined}
          className="accent-emerald-400"
        />
        <span>Boost facial features</span>
      </label>
      <p className="text-xs text-neutral-500">
        Enhances eye, nose, and mouth contrast at low resolutions. Uses an
        on-device face detector.
      </p>
      {!mlAvailable && (
        <p id="face-boost-help" className="text-xs text-amber-400">
          {ML_UNAVAILABLE_TITLE}
        </p>
      )}
    </div>
  );
}

export default FaceBoostToggle;
