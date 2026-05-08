import { useCallback, useEffect, useRef, useState } from "react";
import { dialsMatchPreset, FILTERS, type FilterId } from "../filters";
import AdvancedControlsPanel from "../components/AdvancedControlsPanel";
import AspectRatioSelect, { type AspectRatioValue } from "../components/AspectRatioSelect";
import BrandColorsTextarea from "../components/BrandColorsTextarea";
import DegradedModeNotice from "../components/DegradedModeNotice";
import DropZone from "../components/DropZone";
import ModelLoadIndicator from "../components/ModelLoadIndicator";
import OutlineControl, { type OutlineControlValue } from "../components/OutlineControl";
import PaletteModeControl, { type PaletteMode } from "../components/PaletteModeControl";
import ChunkyPixelsControl from "../components/ChunkyPixelsControl";
import PaletteSizeControl from "../components/PaletteSizeControl";
import PosterizationControl from "../components/PosterizationControl";
import FaceBoostToggle from "../components/FaceBoostToggle";
import SilhouetteControl, {
  DEFAULT_SILHOUETTE_TOLERANCE,
  type SilhouetteQuality,
} from "../components/SilhouetteControl";
import ResolutionSlider from "../components/ResolutionSlider";
import SaturationSlider from "../components/SaturationSlider";
import SideBySidePreview from "../components/SideBySidePreview";
import SmoothnessControl from "../components/SmoothnessControl";
import StyleSelector, { type StyleSelectorValue } from "../components/StyleSelector";
import { usePixelArtPipeline } from "../hooks/usePixelArtPipeline";
import type { SmoothnessLevel } from "../pipeline/bilateral";
import { downloadResultAsPng } from "../pipeline/exportPng";
import { CURATED_PALETTES, type CuratedPaletteId, type RGB } from "../pipeline/palettes";
import type { ValidLongEdge } from "../pipeline/protocol";

/**
 * Default-exported entry point for the pixel-art microfrontend.
 *
 * Two consumers load this same component:
 *   - Portfolio host: `lazy(() => import("remote/PixelArtApp"))` via Module Federation.
 *   - Standalone harness: direct workspace-aliased import.
 *
 * No props, no context dependencies — the component owns all of its own state
 * and is fully self-contained. Origin spec is desktop-primary; below the `md`
 * breakpoint the side-by-side panes stack vertically.
 */

const DEFAULT_RESOLUTION: ValidLongEdge = 64;
const DEFAULT_SATURATION = 0;

export default function PixelArtApp() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  /**
   * v4 source identity. Minted once per file load via `crypto.randomUUID()`
   * and forwarded on every ProcessRequest for that file. Same file = same
   * id (cache reuse); new file = new id (cache eviction). The host portfolio
   * targets evergreen browsers, where `crypto.randomUUID()` is universal.
   */
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ValidLongEdge>(DEFAULT_RESOLUTION);
  const [saturation, setSaturation] = useState<number>(DEFAULT_SATURATION);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioValue>(undefined);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("auto");
  const [curatedPaletteId, setCuratedPaletteId] = useState<CuratedPaletteId>("pico-8");
  const [customPaletteText, setCustomPaletteText] = useState<string>("");
  const [customPaletteColors, setCustomPaletteColors] = useState<readonly RGB[] | null>(null);
  const [brandColorsText, setBrandColorsText] = useState<string>("");
  const [brandColors, setBrandColors] = useState<readonly RGB[] | null>(null);
  const [outline, setOutline] = useState<OutlineControlValue>({
    enabled: false,
    width: 1,
    color: [0, 0, 0],
  });
  const [posterizeBands, setPosterizeBands] = useState<number | undefined>(undefined);
  const [silhouetteEnabled, setSilhouetteEnabled] = useState(false);
  const [silhouetteTolerance, setSilhouetteTolerance] = useState<number>(
    DEFAULT_SILHOUETTE_TOLERANCE,
  );
  // v4 silhouette quality. Default 'fast' preserves R12 byte-identical
  // output (and matches the Custom filter's preset). Filters that opt into
  // ML segmentation (Asset, in U7) set this to 'smart' on apply.
  const [silhouetteQuality, setSilhouetteQuality] = useState<SilhouetteQuality>("fast");
  const [chunkSize, setChunkSize] = useState(1);
  const [paletteSize, setPaletteSize] = useState(16);
  // v4 cartoon-smoothing. Default 'off' is the R12 identity path; the
  // worker bilateral stage short-circuits and the source cache stores the
  // input by reference.
  const [smoothness, setSmoothness] = useState<SmoothnessLevel>("off");
  // v4 face-aware contrast boost (U6). Default false is the R12 baseline:
  // the worker MUST skip MediaPipe `detectLandmarks` entirely when this is
  // false (no `.task` fetch, no `import('@mediapipe/tasks-vision')`).
  // U7 sets this to `true` for the Portrait filter.
  const [faceAwareEnabled, setFaceAwareEnabled] = useState<boolean>(false);
  // v4.1 subject-readability features. Both default off; Asset filter
  // enables both on apply. Only fire when silhouette is enabled.
  const [subjectAwareDownscale, setSubjectAwareDownscale] = useState<boolean>(false);
  const [silhouetteOutline, setSilhouetteOutline] = useState<{
    enabled: boolean;
    width: number;
    color: readonly [number, number, number];
  }>({ enabled: false, width: 1, color: [0, 0, 0] });
  // v4.2 cartoon shaping. All default off / 0; preset filters opt in.
  const [silhouetteCloseRadius, setSilhouetteCloseRadius] = useState<number>(0);
  const [subjectDilateRadius, setSubjectDilateRadius] = useState<number>(0);
  const [tightCropEnabled, setTightCropEnabled] = useState<boolean>(false);
  const [tightCropMargin, setTightCropMargin] = useState<number>(0.05);
  const [subjectAspectOutput, setSubjectAspectOutput] = useState<boolean>(false);
  const [flatFillEnabled, setFlatFillEnabled] = useState<boolean>(false);
  const [flatFillColors, setFlatFillColors] = useState<number>(4);
  // v3 Style state: which filter (if any) the dial state currently matches.
  // 'custom' alone means user is on Custom intentionally; 'custom' with
  // wasFilter set means they drifted from a previously-applied filter.
  const [activeStyle, setActiveStyle] = useState<StyleSelectorValue>("custom");
  const [wasFilter, setWasFilter] = useState<FilterId | null>(null);
  const sourceBitmapRef = useRef<ImageBitmap | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const styleSelectorRef = useRef<HTMLSelectElement | null>(null);

  const { state, process } = usePixelArtPipeline();

  // Object-URL lifecycle. Whenever the source file changes, mint a new URL
  // for the source <img> preview and revoke the previous one. Also mint a
  // fresh sourceId so the worker treats this as a new source and evicts the
  // previous source's cache.
  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl(null);
      setSourceId(null);
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    setSourceId(crypto.randomUUID());
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sourceFile]);

  // Decode source -> ImageBitmap and dispatch when file or resolution changes.
  useEffect(() => {
    if (!sourceFile || !sourceId) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;

    (async () => {
      try {
        bitmap = await createImageBitmap(sourceFile);
        if (cancelled) {
          bitmap.close();
          return;
        }
        // Close the previous bitmap before replacing — prevents leak across
        // file replacements.
        sourceBitmapRef.current?.close();
        sourceBitmapRef.current = bitmap;
        // The pipeline transfers ownership of the bitmap on dispatch, so clone
        // before sending to keep our retained reference valid for the next
        // resolution change.
        const transferable = await createImageBitmap(bitmap);
        const fixedPalette =
          paletteMode === "curated"
            ? CURATED_PALETTES[curatedPaletteId].colors
            : paletteMode === "custom"
              ? (customPaletteColors ?? undefined)
              : undefined;
        process(transferable, resolution, {
          sourceId,
          saturation,
          aspectRatio,
          fixedPalette,
          brandColors: brandColors ?? undefined,
          outlineEnabled: outline.enabled,
          outlineWidth: outline.width,
          outlineColor: outline.color,
          posterizeBands,
          silhouetteEnabled,
          silhouetteTolerance,
          silhouetteQuality,
          chunkSize,
          paletteSize,
          smoothness,
          faceAwareEnabled,
          subjectAwareDownscale,
          silhouetteOutlineEnabled: silhouetteOutline.enabled,
          silhouetteOutlineWidth: silhouetteOutline.width,
          silhouetteOutlineColor: silhouetteOutline.color,
          silhouetteCloseRadius,
          subjectDilateRadius,
          tightCropEnabled,
          tightCropMargin,
          subjectAspectOutput,
          flatFillEnabled,
          flatFillColors,
        });
      } catch {
        // The pipeline hook surfaces worker errors; decode errors here are a
        // separate path. Surface them via a synthetic error state.
        if (!cancelled) {
          // No-op for now; could wire a state setter if decode-error UX matters.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    sourceFile,
    sourceId,
    resolution,
    saturation,
    aspectRatio,
    paletteMode,
    curatedPaletteId,
    customPaletteColors,
    brandColors,
    outline,
    posterizeBands,
    silhouetteEnabled,
    silhouetteTolerance,
    silhouetteQuality,
    chunkSize,
    paletteSize,
    smoothness,
    faceAwareEnabled,
    subjectAwareDownscale,
    silhouetteOutline,
    silhouetteCloseRadius,
    subjectDilateRadius,
    tightCropEnabled,
    tightCropMargin,
    subjectAspectOutput,
    flatFillEnabled,
    flatFillColors,
    process,
  ]);

  // Cleanup retained source bitmap on unmount.
  useEffect(() => {
    return () => {
      sourceBitmapRef.current?.close();
      sourceBitmapRef.current = null;
    };
  }, []);

  // Live-region announcement on status transitions for screen readers.
  useEffect(() => {
    const region = liveRegionRef.current;
    if (!region) return;
    if (state.status === "processing") {
      region.textContent = "Converting image";
    } else if (state.status === "ready" && state.result) {
      region.textContent = `Pixel art ready at ${state.result.width} by ${state.result.height} pixels`;
    } else if (state.status === "error") {
      region.textContent = "Could not convert image. Drop a different file.";
    }
  }, [state]);

  const handleFile = useCallback((file: File) => {
    setSourceFile(file);
  }, []);

  const handleRetry = useCallback(() => {
    setSourceFile(null);
  }, []);

  // v3 filter apply: batch-set every dial state to the preset's values.
  // React 18 auto-batches multiple setState calls within an event handler
  // so all updates land in a single render. Per scope-guardian doc-review
  // feedback, we do NOT use flushSync (which would defeat batching).
  const applyFilter = useCallback((id: FilterId) => {
    const p = FILTERS[id];
    setResolution(p.resolution);
    setSaturation(p.saturation);
    setAspectRatio(p.aspectRatio);
    setPaletteMode(p.paletteMode);
    setCuratedPaletteId(p.curatedPaletteId);
    setPaletteSize(p.paletteSize);
    setOutline({ enabled: p.outlineEnabled, width: p.outlineWidth, color: p.outlineColor });
    setPosterizeBands(p.posterizeBands);
    setSilhouetteEnabled(p.silhouetteEnabled);
    setSilhouetteTolerance(p.silhouetteTolerance);
    setChunkSize(p.chunkSize);
    // v4 dials (U7). React 18 batches all setState calls within an event
    // handler so these land in the same render as the v3 dials above.
    setSmoothness(p.smoothness);
    setFaceAwareEnabled(p.faceAwareEnabled);
    setSilhouetteQuality(p.silhouetteQuality);
    // v4.1 subject-readability dials.
    setSubjectAwareDownscale(p.subjectAwareDownscale);
    setSilhouetteOutline({
      enabled: p.silhouetteOutlineEnabled,
      width: p.silhouetteOutlineWidth,
      color: p.silhouetteOutlineColor,
    });
    // v4.2 cartoon shaping dials.
    setSilhouetteCloseRadius(p.silhouetteCloseRadius);
    setSubjectDilateRadius(p.subjectDilateRadius);
    setTightCropEnabled(p.tightCropEnabled);
    setTightCropMargin(p.tightCropMargin);
    setSubjectAspectOutput(p.subjectAspectOutput);
    setFlatFillEnabled(p.flatFillEnabled);
    setFlatFillColors(p.flatFillColors);
    setActiveStyle(id);
    setWasFilter(null);
  }, []);

  const handlePickCustom = useCallback(() => {
    setActiveStyle("custom");
    setWasFilter(null);
  }, []);

  const handleResetFilter = useCallback(() => {
    if (wasFilter) {
      applyFilter(wasFilter);
      // Per design-lens doc-review: focus returns to the Style dropdown so
      // keyboard users stay oriented after the modified indicator clears.
      styleSelectorRef.current?.focus();
    }
  }, [wasFilter, applyFilter]);

  // Modified-state detection: when any dial drifts from the active filter's
  // expected values, flip activeStyle to "custom" and remember which filter
  // we were on so the StyleSelector can show "(was: X)" + Reset.
  useEffect(() => {
    if (activeStyle === "custom") return;
    const preset = FILTERS[activeStyle];
    const matches = dialsMatchPreset(
      {
        resolution,
        saturation,
        aspectRatio,
        paletteMode,
        curatedPaletteId,
        paletteSize,
        outlineEnabled: outline.enabled,
        outlineWidth: outline.width,
        outlineColor: outline.color,
        posterizeBands,
        silhouetteEnabled,
        silhouetteTolerance,
        chunkSize,
        smoothness,
        faceAwareEnabled,
        silhouetteQuality,
        subjectAwareDownscale,
        silhouetteOutlineEnabled: silhouetteOutline.enabled,
        silhouetteOutlineWidth: silhouetteOutline.width,
        silhouetteOutlineColor: silhouetteOutline.color,
        silhouetteCloseRadius,
        subjectDilateRadius,
        tightCropEnabled,
        tightCropMargin,
        subjectAspectOutput,
        flatFillEnabled,
        flatFillColors,
      },
      preset,
    );
    if (!matches) {
      setWasFilter(activeStyle);
      setActiveStyle("custom");
    }
  }, [
    activeStyle,
    resolution,
    saturation,
    aspectRatio,
    paletteMode,
    curatedPaletteId,
    paletteSize,
    outline,
    posterizeBands,
    silhouetteEnabled,
    silhouetteTolerance,
    chunkSize,
    smoothness,
    faceAwareEnabled,
    silhouetteQuality,
    subjectAwareDownscale,
    silhouetteOutline,
    silhouetteCloseRadius,
    subjectDilateRadius,
    tightCropEnabled,
    tightCropMargin,
    subjectAspectOutput,
    flatFillEnabled,
    flatFillColors,
  ]);

  const handleExport = useCallback(() => {
    if (!state.result) return;
    // Pass active style so the filename carries the asset-type label for
    // game-asset folder sorting (R11 / AE6).
    void downloadResultAsPng(state.result, activeStyle);
  }, [state.result, activeStyle]);

  const hasImage = sourceFile !== null;
  const canExport = state.status === "ready" && state.result !== null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <DropZone onChange={handleFile} disabled={false} />

      {/* Style selector is the highest-leverage v3 control. Above the resolution
         slider; enabled regardless of image-load state so users can pre-arm a
         Style before dropping (F3 game-asset workflow). */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <StyleSelector
          ref={styleSelectorRef}
          value={activeStyle}
          previousFilter={wasFilter}
          onPickFilter={applyFilter}
          onPickCustom={handlePickCustom}
          onReset={handleResetFilter}
        />
      </div>

      {/*
        U8 ML status surfaces. The two share a layout-reserved slot below the
        StyleSelector (ModelLoadIndicator carries `min-h-10`). They are
        mutually exclusive PER STAGE — a stage transitioning loading -> ready
        / failed swaps which one renders without layout jitter. When two
        stages are in different phases (e.g. segmentation loading while
        face-landmarks failed) both surfaces render simultaneously; they
        occupy adjacent vertical space.
      */}
      <ModelLoadIndicator mlStatus={state.mlStatus} />
      <DegradedModeNotice mlStatus={state.mlStatus} />

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <ResolutionSlider value={resolution} onChange={setResolution} disabled={!hasImage} />
      </div>

      {/*
        Per design-lens doc-review feedback: every Advanced control follows a
        uniform "rendered-but-disabled when no image is loaded" policy. Keeps
        the panel discoverable even pre-drop without producing silent no-ops.
      */}
      <AdvancedControlsPanel>
        <SaturationSlider value={saturation} onChange={setSaturation} disabled={!hasImage} />
        <AspectRatioSelect value={aspectRatio} onChange={setAspectRatio} disabled={!hasImage} />
        <PaletteModeControl
          mode={paletteMode}
          onModeChange={setPaletteMode}
          curatedPaletteId={curatedPaletteId}
          onCuratedPaletteIdChange={setCuratedPaletteId}
          customPaletteText={customPaletteText}
          onCustomPaletteTextChange={setCustomPaletteText}
          onCustomPaletteParsed={setCustomPaletteColors}
          disabled={!hasImage}
        />
        <BrandColorsTextarea
          text={brandColorsText}
          onTextChange={setBrandColorsText}
          onParsed={setBrandColors}
          paletteOverridden={paletteMode !== "auto"}
          disabled={!hasImage}
        />
        <OutlineControl value={outline} onChange={setOutline} disabled={!hasImage} />
        <PosterizationControl
          bands={posterizeBands}
          onChange={setPosterizeBands}
          disabled={!hasImage}
        />
        <SilhouetteControl
          enabled={silhouetteEnabled}
          tolerance={silhouetteTolerance}
          onEnabledChange={setSilhouetteEnabled}
          onToleranceChange={setSilhouetteTolerance}
          quality={silhouetteQuality}
          onQualityChange={setSilhouetteQuality}
          mlAvailable={state.mlStatus.segmentation !== "failed"}
          subjectAwareDownscale={subjectAwareDownscale}
          onSubjectAwareDownscaleChange={setSubjectAwareDownscale}
          silhouetteOutlineEnabled={silhouetteOutline.enabled}
          onSilhouetteOutlineEnabledChange={(enabled) =>
            setSilhouetteOutline((prev) => ({ ...prev, enabled }))
          }
          silhouetteCloseRadius={silhouetteCloseRadius}
          onSilhouetteCloseRadiusChange={setSilhouetteCloseRadius}
          subjectDilateRadius={subjectDilateRadius}
          onSubjectDilateRadiusChange={setSubjectDilateRadius}
          tightCropEnabled={tightCropEnabled}
          onTightCropEnabledChange={setTightCropEnabled}
          tightCropMargin={tightCropMargin}
          onTightCropMarginChange={setTightCropMargin}
          subjectAspectOutput={subjectAspectOutput}
          onSubjectAspectOutputChange={setSubjectAspectOutput}
          flatFillEnabled={flatFillEnabled}
          onFlatFillEnabledChange={setFlatFillEnabled}
          flatFillColors={flatFillColors}
          onFlatFillColorsChange={setFlatFillColors}
          disabled={!hasImage}
        />
        <ChunkyPixelsControl chunkSize={chunkSize} onChange={setChunkSize} disabled={!hasImage} />
        <PaletteSizeControl
          paletteSize={paletteSize}
          onChange={setPaletteSize}
          disabled={!hasImage}
        />
        <SmoothnessControl value={smoothness} onChange={setSmoothness} disabled={!hasImage} />
        <FaceBoostToggle
          enabled={faceAwareEnabled}
          onChange={setFaceAwareEnabled}
          mlAvailable={state.mlStatus["face-landmarks"] !== "failed"}
          disabled={!hasImage}
        />
      </AdvancedControlsPanel>

      <SideBySidePreview
        sourceUrl={sourceUrl}
        result={state.result}
        status={state.status}
        errorMessage={state.error?.message}
        onRetry={handleRetry}
        firstRenderActive={state.firstRenderActive}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 shadow transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download PNG
          {state.result && ` (${state.result.width}×${state.result.height})`}
        </button>
      </div>

      {/*
        Build identifier — short git SHA injected at build time via
        vite.config.ts `define`. Lets users confirm which deploy they're
        looking at when iterating; renders inline so it appears whether
        the remote is mounted standalone (harness) or embedded in the
        portfolio host.
      */}
      <p className="mt-2 text-center text-xs text-neutral-600">
        build {__BUILD_ID__}
      </p>
    </div>
  );
}
