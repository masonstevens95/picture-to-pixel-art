import { type ChangeEvent } from "react";
import {
  DEFAULT_SILHOUETTE_TOLERANCE,
  MAX_SILHOUETTE_TOLERANCE,
} from "../pipeline/silhouette";

/**
 * Silhouette / background-removal control: enable toggle + tolerance slider
 * + Quality radio (Fast / Smart) added in U5.
 *
 * Quality semantics:
 *   - 'fast' (v3 default behavior): naive corner-sample of the cropped
 *     image. Works on photos with a clean, uniform background.
 *   - 'smart' (v4 default; selected when ML is available): U2-NetP
 *     segmentation. Lazy-loads the model on first use; falls back to
 *     'fast' (with a one-shot ml-error notice) if the model can't load
 *     or inference fails.
 *
 * When `mlAvailable === false` the Smart option is disabled with an
 * explanatory title attribute. The component does NOT auto-rewrite the
 * stored quality value — selecting Smart while disabled is a no-op
 * because the disabled radio can't fire change events. Owner state stays
 * authoritative; if it's been pre-set to 'smart' before ML failed the
 * worker has already fallen back to Fast on the dispatch path.
 */

export type SilhouetteQuality = "fast" | "smart";

export interface SilhouetteControlProps {
  enabled: boolean;
  tolerance: number;
  onEnabledChange: (enabled: boolean) => void;
  onToleranceChange: (tolerance: number) => void;
  /** Current quality. Undefined treated as 'smart' (v4 default). */
  quality?: SilhouetteQuality;
  /** Quality change handler. Required when `quality` is provided. */
  onQualityChange?: (quality: SilhouetteQuality) => void;
  /**
   * Whether the ML segmentation model is available. Defaults to true. When
   * false, the Smart radio is disabled and shows a tooltip explaining the
   * fallback. The worker layer handles the actual fallback to Fast at
   * dispatch time independently of this UI hint.
   */
  mlAvailable?: boolean;
  /** v4.1 subject-aware downscale toggle. */
  subjectAwareDownscale?: boolean;
  onSubjectAwareDownscaleChange?: (enabled: boolean) => void;
  /** v4.1 silhouette boundary outline toggle. */
  silhouetteOutlineEnabled?: boolean;
  onSilhouetteOutlineEnabledChange?: (enabled: boolean) => void;
  /** v4.2 cartoon shaping group. Each knob is independently togglable. */
  silhouetteCloseRadius?: number;
  onSilhouetteCloseRadiusChange?: (radius: number) => void;
  subjectDilateRadius?: number;
  onSubjectDilateRadiusChange?: (radius: number) => void;
  tightCropEnabled?: boolean;
  onTightCropEnabledChange?: (enabled: boolean) => void;
  tightCropMargin?: number;
  onTightCropMarginChange?: (margin: number) => void;
  subjectAspectOutput?: boolean;
  onSubjectAspectOutputChange?: (enabled: boolean) => void;
  flatFillEnabled?: boolean;
  onFlatFillEnabledChange?: (enabled: boolean) => void;
  flatFillColors?: number;
  onFlatFillColorsChange?: (colors: number) => void;
  disabled?: boolean;
}

const ML_UNAVAILABLE_TITLE =
  "Loading enhanced cutout failed — using basic detection.";

export function SilhouetteControl({
  enabled,
  tolerance,
  onEnabledChange,
  onToleranceChange,
  quality = "smart",
  onQualityChange,
  mlAvailable = true,
  subjectAwareDownscale = false,
  onSubjectAwareDownscaleChange,
  silhouetteOutlineEnabled = false,
  onSilhouetteOutlineEnabledChange,
  silhouetteCloseRadius = 0,
  onSilhouetteCloseRadiusChange,
  subjectDilateRadius = 0,
  onSubjectDilateRadiusChange,
  tightCropEnabled = false,
  onTightCropEnabledChange,
  tightCropMargin = 0.05,
  onTightCropMarginChange,
  subjectAspectOutput = false,
  onSubjectAspectOutputChange,
  flatFillEnabled = false,
  onFlatFillEnabledChange,
  flatFillColors = 4,
  onFlatFillColorsChange,
  disabled = false,
}: SilhouetteControlProps) {
  const handleEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    onEnabledChange(event.target.checked);
  };

  const handleToleranceChange = (event: ChangeEvent<HTMLInputElement>) => {
    onToleranceChange(Number(event.target.value));
  };

  const handleQualityChange = (next: SilhouetteQuality) => {
    onQualityChange?.(next);
  };

  // Smart radio is disabled when the ML model failed to load. Fast remains
  // available always (no model required). When the parent didn't supply a
  // quality handler, treat the radios as read-only/disabled — the toggle
  // is still visible so the UI doesn't differ between v3 / v4 callers, but
  // it can't be operated.
  const qualityInteractable = !disabled && onQualityChange !== undefined;
  const smartDisabled = disabled || !mlAvailable || !onQualityChange;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-neutral-200">Silhouette</legend>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleEnabledChange}
          disabled={disabled}
          className="accent-emerald-400"
        />
        <span>Remove background</span>
      </label>
      <p className="text-xs text-neutral-500">
        Smart uses an on-device model; Fast samples corners of the cropped image.
      </p>
      <fieldset className="flex flex-col gap-1 pl-1" disabled={!qualityInteractable || !enabled}>
        <legend className="sr-only">Cutout quality</legend>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="radio"
            name="silhouette-quality"
            value="fast"
            checked={quality === "fast"}
            onChange={() => handleQualityChange("fast")}
            disabled={!qualityInteractable || !enabled}
            className="accent-emerald-400"
          />
          <span>Fast (naive)</span>
        </label>
        <label
          className="flex items-center gap-2 text-xs text-neutral-300"
          title={!mlAvailable ? ML_UNAVAILABLE_TITLE : undefined}
        >
          <input
            type="radio"
            name="silhouette-quality"
            value="smart"
            checked={quality === "smart"}
            onChange={() => handleQualityChange("smart")}
            disabled={smartDisabled || !enabled}
            aria-describedby={!mlAvailable ? "silhouette-quality-help" : undefined}
            className="accent-emerald-400"
          />
          <span>Smart (ML)</span>
        </label>
        {!mlAvailable && (
          <p id="silhouette-quality-help" className="text-xs text-amber-400">
            {ML_UNAVAILABLE_TITLE}
          </p>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="w-20">Tolerance</span>
        <input
          type="range"
          min={0}
          max={MAX_SILHOUETTE_TOLERANCE}
          step={1}
          value={tolerance}
          onChange={handleToleranceChange}
          disabled={disabled || !enabled}
          aria-label="Background tolerance"
          className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="w-8 text-right tabular-nums text-neutral-300">{tolerance}</span>
      </label>
      {onSubjectAwareDownscaleChange && (
        <label className="flex items-center gap-2 pl-1 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={subjectAwareDownscale}
            onChange={(e) => onSubjectAwareDownscaleChange(e.target.checked)}
            disabled={disabled || !enabled}
            className="accent-emerald-400"
          />
          <span>Preserve subject detail</span>
        </label>
      )}
      {onSilhouetteOutlineEnabledChange && (
        <label className="flex items-center gap-2 pl-1 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={silhouetteOutlineEnabled}
            onChange={(e) => onSilhouetteOutlineEnabledChange(e.target.checked)}
            disabled={disabled || !enabled}
            className="accent-emerald-400"
          />
          <span>Outline subject boundary</span>
        </label>
      )}
      {(onSilhouetteCloseRadiusChange ||
        onSubjectDilateRadiusChange ||
        onTightCropEnabledChange ||
        onFlatFillEnabledChange) && (
        <fieldset
          className="mt-1 space-y-2 border-t border-neutral-800 pt-2 pl-1"
          disabled={disabled || !enabled}
        >
          <legend className="text-xs font-medium text-neutral-300">Cartoon shaping</legend>
          {onSilhouetteCloseRadiusChange && (
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="w-24">Mask close</span>
              <input
                type="range"
                min={0}
                max={15}
                step={1}
                value={silhouetteCloseRadius}
                onChange={(e) => onSilhouetteCloseRadiusChange(Number(e.target.value))}
                disabled={disabled || !enabled}
                aria-label="Silhouette mask close radius"
                className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-8 text-right tabular-nums text-neutral-300">
                {silhouetteCloseRadius}
              </span>
            </label>
          )}
          {onSubjectDilateRadiusChange && (
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="w-24">Fatten subject</span>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={subjectDilateRadius}
                onChange={(e) => onSubjectDilateRadiusChange(Number(e.target.value))}
                disabled={disabled || !enabled}
                aria-label="Subject dilation radius"
                className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-8 text-right tabular-nums text-neutral-300">
                {subjectDilateRadius}
              </span>
            </label>
          )}
          {onTightCropEnabledChange && (
            <>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={tightCropEnabled}
                  onChange={(e) => onTightCropEnabledChange(e.target.checked)}
                  disabled={disabled || !enabled}
                  className="accent-emerald-400"
                />
                <span>Tight crop to subject</span>
              </label>
              {onTightCropMarginChange && (
                <label className="flex items-center gap-2 pl-5 text-xs text-neutral-400">
                  <span className="w-20">Margin</span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={Math.round(tightCropMargin * 100)}
                    onChange={(e) =>
                      onTightCropMarginChange(Number(e.target.value) / 100)
                    }
                    disabled={disabled || !enabled || !tightCropEnabled}
                    aria-label="Tight crop margin"
                    className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="w-8 text-right tabular-nums text-neutral-300">
                    {Math.round(tightCropMargin * 100)}%
                  </span>
                </label>
              )}
              {onSubjectAspectOutputChange && (
                <label className="flex items-center gap-2 pl-5 text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    checked={subjectAspectOutput}
                    onChange={(e) => onSubjectAspectOutputChange(e.target.checked)}
                    disabled={disabled || !enabled || !tightCropEnabled}
                    className="accent-emerald-400"
                  />
                  <span>Subject-aspect output (no square pad)</span>
                </label>
              )}
            </>
          )}
          {onFlatFillEnabledChange && (
            <>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={flatFillEnabled}
                  onChange={(e) => onFlatFillEnabledChange(e.target.checked)}
                  disabled={disabled || !enabled}
                  className="accent-emerald-400"
                />
                <span>Flat-fill foreground</span>
              </label>
              {onFlatFillColorsChange && (
                <label className="flex items-center gap-2 pl-5 text-xs text-neutral-400">
                  <span className="w-20">Colors</span>
                  <input
                    type="range"
                    min={2}
                    max={8}
                    step={1}
                    value={flatFillColors}
                    onChange={(e) => onFlatFillColorsChange(Number(e.target.value))}
                    disabled={disabled || !enabled || !flatFillEnabled}
                    aria-label="Flat-fill cluster count"
                    className="flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="w-6 text-right tabular-nums text-neutral-300">
                    {flatFillColors}
                  </span>
                </label>
              )}
            </>
          )}
        </fieldset>
      )}
    </fieldset>
  );
}

export { DEFAULT_SILHOUETTE_TOLERANCE };
export default SilhouetteControl;
