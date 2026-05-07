---
date: 2026-05-07
topic: pixel-art-cartoon-quality
---

# Pixel-Art Cartoon Quality (v4)

## Summary

A coherent quality release that fixes outline / coloring / silhouette / face-definition as one cohesive cartoon jump. Replaces Sobel outlines with XDoG (applied after quantize), adds bilateral pre-quantize smoothing for flat-region coloring, adds ML subject segmentation for background removal that actually works on cluttered photos, and adds ML face-landmark detection to preserve eyes/mouth at low resolution. The worker becomes source-stateful — heavy stages cache per source so slider drag stays at v3 speed after the first render.

---

## Problem Frame

v3 shipped 5 stylistic filter presets (Art piece, Portrait, Units, Asset, Environment) with the framing that they'd produce game-asset-ready output for each named category. In practice, on real photos the v3 pipeline doesn't deliver the cartoon look the README promises across all four cartoon-leaning filters (Portrait, Units, Asset). Specific failures observed by the user:

- **Outlines noisy.** Sobel-on-luminance picks up every photographic gradient — hair texture, skin pores, fabric grain, JPEG artifacts. The result reads as scribble noise, not drawn lines. The outline color also gets absorbed into Wu's palette assignment because outline runs *before* quantize, so even "thick black outline" can come out grey or brown after quantization.
- **Coloring muted.** Wu quantization picks the most-frequent colors in the source pixel population and snaps every pixel to one of those colors. For a portrait, that's mostly skin tones; for a unit photo, whatever fills the frame. The pipeline lacks the step a real cartoon filter has: smoothing inside regions while preserving edges (bilateral / anisotropic diffusion). Without it, quantize produces muted noise rather than flat shaded cels.
- **Background removal effectively broken.** Naive corner-sample silhouette assumes the four corners agree on a uniform background color. Real photos almost never satisfy that — slight gradient, JPEG noise, or any non-flat background and the cutout fails. The Asset filter, which depends on this, is the most-broken filter in v3.
- **Face / eye definition lost.** At Portrait long-edge 128, eyes are 2–3 pixels wide; area-average downscale blends them into surrounding skin, then quantize snaps everything to a skin tone, and eyes vanish. The cartoon look needs eyes, mouths, and noses to read at any resolution — this requires explicit feature-aware processing the v3 pipeline doesn't have.

The underlying diagnosis: v3's pipeline was designed as "downscale + quantize" with cartoon polish bolted on through Sobel outlines and posterization. That stack doesn't reach the cartoon look on real photographic input. v4 replaces the broken primitives with the algorithms cartoon-stylization research has converged on (XDoG, bilateral, ML segmentation, ML landmarks) and re-tunes filter defaults to match.

---

## Actors

Carried from v3 brainstorm (`docs/brainstorms/2026-05-06-pixel-art-style-filters-requirements.md`):

- A1. **Portfolio visitor** — lands on the project tab inside the host portfolio, expects to try the tool in-place. v4 changes the "first try" experience because models load on demand.
- A2. **Standalone visitor** — same, on the standalone deploy.
- A3. **Game-asset producer** — uses the tool to produce a folder of stylistic outputs. v4 is most consequential here: Asset filter actually works on real photos with cluttered backgrounds, and Portrait outputs preserve facial features that previously vanished.

---

## Key Flows

- F1. **Convert via portfolio embed** (carried from v3) — extended at v4 with model-load step on first cartoon-filter or silhouette use.
- F2. **Convert via standalone deploy** (carried from v3) — same.

- F3. **First-time cartoon-filter use** (new in v4)
  - **Trigger:** A1/A2/A3 picks Portrait, Units, or Asset for the first time after page load.
  - **Steps:**
    1. The needed ML model(s) begin lazy-loading; a progress indicator surfaces below the StyleSelector.
    2. While model loads, the pipeline runs in degraded mode (naive corner-sample silhouette, no face-aware processing) so the user sees *something* immediately.
    3. When models finish loading, the result re-renders with full v4 quality.
    4. Subsequent filter changes / slider drags use the cached models; no further loading.
  - **Outcome:** First-render is slower (200–500 ms after model load) but the user sees a result immediately and the upgrade is noticeable.
  - **Covered by:** R1, R6, R10, R11, R12

- F4. **Source change with ML active** (new in v4)
  - **Trigger:** A1/A2/A3 drops a new image while a cartoon filter is active.
  - **Steps:**
    1. Worker invalidates the source-cache.
    2. Bilateral, segmentation, and face-detection re-run on the new source (~200–400 ms).
    3. A small spinner overlays the result pane during this first render.
    4. Result appears with full v4 quality.
    5. Subsequent slider drags reuse the cached source-stage outputs at v3-equivalent speed (~30–60 ms).
  - **Outcome:** Per-source heavy work runs once; per-dispatch work stays light. Slider drag UX preserved.
  - **Covered by:** R7, R10

- F5. **Model load failure / offline** (new in v4)
  - **Trigger:** A1/A2 visits with no network, or model CDN is unreachable, or browser blocks WebAssembly.
  - **Steps:**
    1. Pipeline detects model-load failure.
    2. An inline notice surfaces below the StyleSelector ("ML cutout unavailable — using basic background detection").
    3. Pipeline gracefully degrades: silhouette uses naive corner-sample; cartoon filters skip the face-aware processing; bilateral and XDoG (CPU-only) still run.
    4. The user gets a v3-equivalent result with an honest signal about reduced quality.
  - **Outcome:** Tool stays functional offline. Quality drops back to v3's documented limits.
  - **Covered by:** R13

---

## Requirements

**New pipeline stages**
- R1. **Bilateral pre-quantize smoothing.** New worker stage between saturation and downscale that smooths inside regions while preserving edges. Single user-facing knob: "Smoothness" (Off / Low / Medium / High). Default Off preserves v3 invariant. The math behind the knob (spatial σ, color σ) is implementation detail; the user sees one control.
- R2. **XDoG outline transform** replaces v3's Sobel-based outline. Produces stylized cartoon line art (thick subject silhouettes, thin interior detail) instead of generalized luminance-gradient noise. Outline applies AFTER quantize so the configured outline color stays the actual output color.
- R3. **ML subject segmentation** for silhouette / background removal. General-subject model (suitable for people, animals, weapons, items, objects) — not person-only. Replaces naive corner-sample as the v4 default when models load successfully. Naive corner-sample retained as fallback path.
- R4. **ML face-landmark detection + landmark-aware contrast boost.** When a face is detected in the source, eyes/mouth/nose regions get a small contrast bump on the source image before downscale, so those features survive low-resolution quantization. Face-aware processing only fires when a face is detected; non-face sources are unchanged.

**Filter-default re-tuning**
- R5. **Cartoon filter defaults updated.** Portrait, Units, and Asset get bilateral on (Medium smoothness), XDoG outline replacing Sobel, retuned saturation defaults. Portrait raises to long-edge 192 by default — eyes survive at 192 in a way they don't at 128. Art piece and Environment unchanged (painterly filters don't want bilateral or outlines).

**Caching architecture (worker source state)**
- R6. **Lazy model loading.** Models load on first cartoon-filter or silhouette use, not on app mount. Cache to browser Cache Storage so subsequent visits and additional conversions in the same session reuse the cached model files.
- R7. **Source-cached worker state.** Bilateral, segmentation, and face-landmark results cache per source image inside the worker. New source invalidates cache; same source with new resolution / palette / posterize / etc. reuses the cache. Slider drag stays at v3-equivalent speed (~30–60 ms per dispatch) after the first render.

**UX surfaces**
- R8. **Model-download progress indicator** below the StyleSelector while models load.
- R9. **First-render spinner** overlays the result pane during the heavy-stage run on a new source. Disappears when first dispatch completes.
- R10. **First-render visual fallback.** While ML models are downloading, the pipeline runs in degraded mode (naive corner-sample, no face-aware) so the user sees an immediate result. Result re-renders to full quality after models load.
- R11. **Each new pipeline stage exposed as an individual Advanced control.** Bilateral has the Smoothness selector. XDoG outline replaces the existing OutlineControl (same component name; algorithm swap is internal). ML segmentation extends the existing SilhouetteControl with a Quality toggle (Fast naive / Smart ML, default Smart when available). Face-aware processing is a single toggle ("Boost facial features").

**v3 invariant**
- R12. **v3-default invariant.** With every v4 control at its default off-state (Smoothness=Off, ML disabled / unavailable, face-aware off, naive silhouette path), the pipeline produces output bit-identical to v3 for the same input. Each new stage has a function-level identity short-circuit; the v3-invariant test from v3 extends to cover v4 defaults.

**Failure handling**
- R13. **Graceful degradation when ML unavailable.** Model load failure (network error, CSP block, missing WebAssembly support) does not break the tool. Inline notice surfaces; pipeline falls back to v3-equivalent output (naive corner-sample silhouette, no face-aware processing). Bilateral and XDoG still run because they're CPU-only.

**Performance**
- R14. **Latency budgets.** First render of a new source with ML stages active: ≤ 500 ms on typical 2026 laptop hardware. Per-dispatch (slider drag) after cache warm: ≤ 60 ms. Model first-download: depends on connection but progress indicator surfaces it; cached load on subsequent visits: ≤ 100 ms.

**Bundle**
- R15. **Bundle posture.** ML model files load via Cache Storage on demand; they are NOT bundled into the v4 JavaScript chunk. Worker JS bundle grows to accommodate the runtime (e.g., ONNX Runtime Web / Transformers.js) but stays under ~50 KB raw exposed-chunk increase. Total user-perceived first-load: existing chunk (~31 KB raw v3) + new code + on-demand model download (5–6 MB combined).

---

## Acceptance Examples

- AE1. **Covers R1, R5.** Given a portrait photo dropped with the Portrait filter active, when the user observes the result, the skin shading reads as flat regions with hard transitions (bilateral + quantize producing cel-shaded effect) rather than as muted color noise.
- AE2. **Covers R2, R5.** Given any photographic source with the Units filter active, when outlines are produced, the line work follows the subject's silhouette and major interior contours (eye sockets, mouth, weapon edges) rather than tracing every texture gradient. The outline color in the output exactly matches the configured outline color (no palette-absorption shift).
- AE3. **Covers R3, R5.** Given a sword photographed against a busy living-room background dropped with the Asset filter, the resulting PNG carries a transparent background that follows the sword's actual silhouette — not just the corner-sampled "white-ish" pixels.
- AE4. **Covers R4, R5.** Given a face photo at Portrait filter (long-edge 192), the eyes, mouth, and nose are visible and identifiable in the output. Without R4, the same source at long-edge 192 still has eyes vanish because of skin-tone-dominant quantization.
- AE5. **Covers R7.** Given a source dropped and the user dragging the resolution slider through 5 different values, the first render is observable (~200–500 ms) and subsequent re-renders are perceived as live (≤ 60 ms). The user does not experience the heavy ML cost on every slider tick.
- AE6. **Covers R12.** Given Smoothness=Off + outline disabled + ML disabled (or unavailable) + face-aware off + every other v3 control at v3 default, the output for a fixed source ImageData is byte-identical to v3's output for the same source.
- AE7. **Covers R10, R13.** Given a fresh page load (no cached models) and Asset filter picked first, the user sees a degraded-quality result within 1 second (naive corner-sample). When models finish loading (~3–10 seconds depending on connection), the result re-renders with ML-quality cutout.
- AE8. **Covers R13.** Given a browser session where the model CDN is unreachable, the StyleSelector surfaces an inline notice ("ML cutout unavailable — using basic background detection"). The user can still drop, convert, and download — output uses naive corner-sample.

---

## Success Criteria

- A user dropping a typical photographic source with the Asset filter picked sees a usable game-asset cutout — subject preserved, background actually removed, outline visible — without picking a special "clean background" image.
- A user dropping a face photo with Portrait filter sees a result where eyes / mouth / nose are clearly visible at the output resolution. v3's "face becomes a smooth blob" failure mode does not occur.
- The slider continues to feel live after the first render of a new source. Heavy ML cost is paid once per source, not per slider tick.
- v3's existing functionality is preserved bit-identically when v4 controls are at their default off state. Returning v3 users see no regression for their workflow.
- Tool works offline / when ML models can't load — a degraded-quality result is still produced rather than a blank screen or error.
- ce-plan inherits enough scope clarity that no v4 product behavior is reinvented at planning time. Algorithm class (XDoG, bilateral, U2-NetP-class segmentation, BlazeFace-class landmarks) is committed; specific model and runtime picks are plan-time decisions.

---

## Scope Boundaries

- **Approach B (end-to-end stylization model)** — explicitly considered and rejected. Sacrifices v3's controllable-pipeline philosophy and over-corrects toward whatever style the model was trained on (anime, Pixar-3D, etc.). Targeted pipeline fixes preserve compounding work.
- **Server-side processing** — client-only constraint preserved from v1.
- **Custom-trained / fine-tuned models** — use off-the-shelf only. The v4 quality bar is "ML-quality common-case results," not "custom model fits our specific aesthetic."
- **Mask editing UI** (paint to refine ML cutout) — useful but a different feature class. v5+ if mask quality complaints emerge after v4 ships.
- **Real-time video / multi-image batch** — still single-image.
- **Specific-style toggles** ("Anime" / "Disney" / "Comic Book") — the cartoon target is one direction, not a style menu. v3 already has filter presets that cover stylistic variation.
- **Per-region color simplification** (segment image into regions then assign one palette color per segment) — was considered for "cartoon flat-color regions" but bilateral + quantize achieves similar results at much lower complexity. Revisit only if v4's quality bar isn't met after shipping.
- **GPU / WebGPU acceleration** — WASM-only first. WebGPU is a perf optimization, not a feature. Revisit if ML latency is the bottleneck after v4 ships.
- **Person-only segmentation models** (MediaPipe Selfie Segmentation) — explicitly rejected. Asset filter needs general subjects (weapons, items, animals); person-only would break the most important silhouette use case.
- **Removing naive corner-sample silhouette** — retained as fallback for offline / model-load failure / "Quality: Fast" toggle. Deletion is defensible later if ML reliability is high enough; v4 keeps it for graceful degradation.
- **Auto-detecting cartoon vs photo source content** to decide which stages to run — pipeline runs the configured stages; no source-type heuristics.
- **Bundling models into the JS chunk** — models load on demand, not eagerly. Bundle stays portfolio-friendly; first cartoon-filter use is when model download surfaces.

---

## Key Decisions

- **Approach A (targeted pipeline fixes), not Approach B (single stylization model).** Preserves v3's iterative control-surface investment; each v4 stage is independently replaceable later; user complaint is "controls produce bad output," not "I want fewer controls."
- **Source-cached worker pipeline.** Heavy ML/bilateral stages cache per source; per-dispatch stays light. Preserves v3's live-slider-drag feel after first render. Architectural change: worker keeps state between dispatches keyed by an opaque source-id from main thread.
- **Lazy model loading on first need.** Not bundled, not preloaded. First cartoon-filter or silhouette use triggers download; subsequent uses hit Cache Storage.
- **General-subject ML segmentation** (U2-NetP-class), not person-only (MediaPipe Selfie). Asset filter is the most-broken v3 filter; it needs to work on weapons and items, not just people.
- **Face-landmark detection runs only when a face is detected.** Non-face sources skip the face-aware processing; no wasted inference on weapon photos.
- **XDoG over plain DoG / Sobel.** Industry-standard for cartoon line art; documented better quality for the use case; not meaningfully more expensive.
- **Bilateral as a "Smoothness" knob (Off / Low / Med / High), not raw σ-sliders.** User-level intent over algorithm parameters.
- **Naive corner-sample retained as fallback.** Graceful degradation when ML unavailable; surfaces an inline notice so the user knows quality dropped.
- **Filter defaults change.** Cartoon filters get bilateral on, XDoG outline, retuned saturation. v3 invariant only holds when controls are explicitly defaulted off — applying a filter changes things, by design.
- **Models live in Cache Storage, not bundled.** Bundle cost stays portfolio-friendly; user-perceived first-load only pays for code, not weights.

---

## Dependencies / Assumptions

- **v3 ships and is the baseline.** v4 builds on v3's worker pipeline, control surface, and protocol.
- **Browser support assumptions**: modern browsers with `OffscreenCanvas`, `WebAssembly`, `Cache Storage` (already required by v1/v2/v3); ML runtime requires WASM SIMD support (Chrome 91+, Safari 16.4+, Firefox 89+ — all baseline 2026). Browsers without one of these fall through to the v3-degraded fallback path.
- **Model-runtime choice deferred to plan**: ONNX Runtime Web vs Transformers.js vs MediaPipe's own runtime. The runtime choice is a real plan-time architectural decision (bundle size, performance, model format compatibility) and isn't settled here.
- **Specific model picks deferred to plan**: U2-NetP-class for segmentation could be U2-NetP itself, RMBG-1.4-light, or another general-subject model in the 4–8 MB range. BlazeFace-class for landmarks could be MediaPipe Face Detection, BlazeFace, or another <2 MB landmark model. The class is committed; the specific pick is a plan-time decision.
- **Model hosting**: a CDN-hosted location (jsDelivr, Hugging Face, Cloudflare R2) for the model files. Plan-time decision.
- **Bundle budget**: v3 raised the verify-build ceiling to 34 KB raw on the exposed PixelArtApp chunk. v4 adds new components (Smoothness control, model load progress, ML toggle on Silhouette) plus the runtime adapter. Realistic v4 ceiling: 50–80 KB raw (1.5–2.5× v3); model files themselves are not counted because they're loaded separately.
- **Performance baseline**: targets in R14 assume typical 2026 laptop hardware (Apple Silicon M-series, mid-range Intel/AMD with WASM SIMD). Lower-spec hardware will exceed budgets; we accept that as a design choice, not a bug.
- **First-render UX**: the "first render is slower with a spinner" pattern is acceptable for a portfolio piece. A commercial product would need more polish here.

---

## Outstanding Questions

### Resolve Before Planning

- (None — scope is settled for v4.)

### Deferred to Planning

- [Affects R3] **Specific segmentation model pick**: U2-NetP vs RMBG-1.4-light vs other general-subject models in the 4–8 MB class. Trade-off is bundle-size vs cutout quality. Plan-time decision based on actual model evaluation.
- [Affects R4] **Specific face-landmark model pick**: MediaPipe Face Detection vs BlazeFace vs other <2 MB landmark models. Plan-time decision.
- [Affects R3, R4] **ML runtime choice**: ONNX Runtime Web (broadest model compatibility, ~1 MB runtime) vs Transformers.js (heavier but better DX, ~3 MB) vs MediaPipe's own runtime (lighter but only supports MediaPipe models). Affects bundle and which models are usable.
- [Affects R6] **Model hosting**: which CDN (jsDelivr / Hugging Face / Cloudflare / a own-hosted bucket). Plan-time decision; affects CORS, caching headers, deploy independence.
- [Affects R1] **Bilateral filter implementation**: pure-JS port (slow but no dep), WASM via OpenCV.js subset (heavy), or WebGL shader (fast but adds GPU path). Plan-time technical decision.
- [Affects R2] **XDoG vs full Coherence-Enhancing-Diffusion + XDoG** for outline. Pure XDoG is fast and "good enough" for v4; CED+XDoG is higher quality but ~5× slower. Plan-time call once we know typical-image performance.
- [Affects R7] **Source-cache invalidation key**: opaque session-source-id from main thread vs hash of source ImageData. Hash is more robust (catches "same file dropped twice in a row" correctly) but adds compute on every drop. Plan picks.
- [Affects R10] **Degraded-mode policy during model load**: run naive silhouette + skip cartoon outline (so result is "v3-quality with v3-style outline disabled"), or run naive + Sobel outline (so result more closely matches v4-style). Plan picks based on what feels less jarring at upgrade time.
- [Affects R8, R9] **Visual treatment of model-download progress and first-render spinner** — color, position, copy. Plan picks.
- [Affects R11] **SilhouetteControl Quality toggle UX**: is the toggle visible always or only when ML is available? When ML model fails, does the toggle disappear or grey out with a tooltip? Plan picks.
