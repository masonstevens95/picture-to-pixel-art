---
date: 2026-05-06
topic: pixel-art-style-filters
---

# Pixel-Art Style Filters (v3)

## Summary

Reframe the tool from "photo-to-pixel-art converter" to "game-asset producer with stylistic presets." Adds a top-level Style selector with 5 filter presets — Art piece, Portrait, Units, Asset, Environment — plus four new pipeline transforms (outlines, posterization, silhouette/background-removal, chunky pixel grouping) and a relaxed palette-size control. Filters populate all dials at once; new transforms are also independently usable in Advanced.

---

## Problem Frame

v1 and v2 shipped a tool that produces a single style of output: low-resolution, palette-quantized images with sensible defaults. That works for "drop a photo and see pixel art," but the output isn't differentiated for *use* — every image looks the same kind of pixel-art regardless of whether the user wanted a moody loading-screen piece, a snappy cartoon weapon icon, or a character portrait. Someone trying to use the tool to produce a folder of game assets has to manually tune dials per asset type and still can't reach certain looks (cartoon outlines, gradient atmospheric pieces, sprite-ready cutouts) because the pipeline has no transforms for them.

Game-asset workflow has well-known stylistic categories — title-screen art differs from in-game units differs from collectible weapons — and the dials that produce each category are largely fixed once you know the category. A preset selector that bundles "what works for this asset type" is the natural product shape for this user need, and it's the cheapest way to make the tool feel oriented toward game assets rather than photo demos.

---

## Actors

- A1. **Portfolio visitor**: lands on the project tab inside the host portfolio, expects to try the tool in-place. Now has access to filter presets that produce visibly distinct results without tuning Advanced.
- A2. **Standalone visitor**: lands on the standalone deploy directly, same affordances.
- A3. **Game-asset producer (new emphasis)**: a visitor who is using the tool to produce a folder of stylistic outputs for a game project. Cares about silhouette/cutout (drops cleanly into engines), per-asset-type stylistic consistency, and being able to crank through multiple sources quickly.

A3 is the same human as A1/A2, just framed by their workflow rather than their entry point.

---

## Key Flows

- F1. **Convert via portfolio embed (v1+v2 carries forward)**
  - **Trigger:** A1 navigates to the pixel-art project tab.
  - **Steps:** drop photo → adjust dials or pick a Style → result re-renders → download PNG. (Style picking is new; otherwise unchanged.)
  - **Outcome:** A1 gets a pixel-art PNG; if Style="Asset" with silhouette on, the PNG carries transparency.
  - **Covered by:** R1, R2, R3, R4, R6, R7, R10

- F2. **Convert via standalone deploy (v1+v2 carries forward)**
  - Same as F1 inside the harness shell.

- F3. **Game-asset producer iterates through multiple sources (new)**
  - **Trigger:** A3 wants a folder of consistent stylistic outputs.
  - **Steps:**
    1. Pick a filter (e.g., "Asset") once.
    2. Drop source 1 → tweak nothing → download.
    3. Drop source 2 → tweak nothing → download. (Filter setting persists across drops in the same session.)
    4. Repeat. Optionally switch filter and repeat for a different asset type.
  - **Outcome:** A consistent batch of stylistically-aligned outputs without re-tuning per source.
  - **Covered by:** R1, R3, R10

---

## Requirements

**Style selector**
- R1. A top-level **Style selector** sits above the existing resolution slider, with 6 options: `Custom` (default — v2 behavior), `Art piece`, `Portrait`, `Units`, `Asset`, `Environment`.
- R2. Picking any non-Custom Style **populates all dials** — existing v2 controls (resolution, aspect, palette mode, palette ID or custom hex, brand colors, saturation) AND the new v3 transform controls — with that filter's curated default values.
- R3. After a filter is applied, the user can tweak any individual control. Doing so flips the Style selector to display `Custom (was: <filter name>)` so the user sees they've drifted from the preset. Picking the same filter again re-applies the preset; picking `Custom` clears the indicator without changing dial values.
- R4. The active Style persists across image drops within a session — dropping a new photo does not reset the Style.

**Per-filter default values**

| Filter | Long edge | Palette mode | Palette size / id | Saturation | Aspect | Outline | Posterization | Silhouette | Chunky |
|---|---|---|---|---|---|---|---|---|---|
| Custom (default) | 64 | Auto | 16 | 0 | Source | off | off | off | 1× |
| Art piece | 256 | Auto | 48 | 0 | Source | off | off | off | 1× |
| Portrait | 128 | Auto | 24 | +0.10 | Source | thin (1 px), black | mild (6 bands) | off | 1× |
| Units | 64 | Curated PICO-8 | 16 | +0.30 | Square | thick (3 px), black | aggressive (4 bands) | off | 2× |
| Asset | 48 | Curated EGA-16 | 16 | +0.20 | Square | thick (3 px), black | aggressive (4 bands) | **on** | 1× |
| Environment | 192 | Auto | 48 | +0.10 | Landscape (4:3) | off | off | off | 1× |

The numeric defaults above are starting points; planning may refine them based on real source images, but every cell is a product decision and an implementer should not invent different defaults without surfacing the change.

**New pipeline transforms (also exposed individually in Advanced)**
- R5. **Outline transform.** Edge detection on the pre-quantization image followed by line thickening, overlaid in a chosen color before quantization. Advanced controls: enabled (toggle), width (1–3 px), color (default black). Off by default in Custom Style; non-Off in Portrait, Units, Asset.
- R6. **Posterization transform.** Per-channel band reduction applied before palette quantization. Distinct from palette size: palette size controls which colors survive; posterization controls how many gradient steps exist before color choice. Advanced controls: enabled (toggle), bands (2–8). Off in Custom; mild (6 bands) in Portrait; aggressive (4 bands) in Units and Asset.
- R7. **Silhouette / background-removal transform (corner-sample).** Sample the four corner pixels of the source, average them as the assumed background color, replace pixels within a tolerance threshold with `alpha = 0`. Advanced controls: enabled (toggle), tolerance (low/medium/high or numeric 0–30 of 255). Off everywhere by default except the **Asset** filter, which turns it on.
- R8. **Chunky pixel transform.** Final-pass post-render where each output pixel is repeated as an N×N block. N=1 is a no-op (v1/v2 behavior). Advanced controls: N (1–4). Used by Units (2×) only by default.

**Palette-size control**
- R9. The palette size — fixed at 16 in v1/v2 — becomes a user-exposed control in the range 8–128. Default remains 16 (preserves v1/v2 invariant). Painterly filters (Art piece, Environment) use 48; Portrait uses 24; the graphic filters keep 16.

**Output and export**
- R10. PNG export preserves transparency when silhouette is on. The exported PNG carries an alpha channel; pixels matched as background are fully transparent.
- R11. Downloaded filename includes the active Style for easier organization in a game-asset folder, e.g. `pixel-art-asset-48x48.png` or `pixel-art-environment-192x144.png`. `Custom` outputs use the v2 naming (`pixel-art-WxH.png`).

**v1/v2 invariant**
- R12. With Style=`Custom` and every new transform at its default off-state and palette size at 16, the worker pipeline produces output bit-identical to v2 for the same input. The "Custom (default)" entry in the per-filter table above defines this state.

**Worker protocol**
- R13. The worker protocol gains optional fields for outline, posterization, silhouette, chunky-pixels parameters, and palette size. Absence of any field reproduces v1/v2 default behavior. No breaking change.

---

## Acceptance Examples

- AE1. **Covers R1, R2.** Given the user picks `Units` from the Style selector with no other interaction, when the tool re-renders, the resolution slider reads 64, the palette mode is `Curated → PICO-8`, saturation is +0.30, aspect is `Square`, outline is on with thick black, posterization is on with 4 bands, silhouette is off, chunky is 2×.
- AE2. **Covers R3.** Given the user picks `Units`, then nudges the saturation slider, the Style selector visibly switches its display to `Custom (was: Units)` while every other dial retains the Units preset value.
- AE3. **Covers R7, R10.** Given the user picks `Asset` and drops a photo of a sword on a clean white background, the resulting PNG (when downloaded) carries transparency and the white pixels are alpha=0; the sword pixels retain full opacity.
- AE4. **Covers R12.** Given Style=`Custom`, all new transforms at off, palette size at 16, and every v2 control at its v2-default, the worker output for a fixed source ImageData is byte-identical to v2's output for the same source.
- AE5. **Covers R4.** Given the user picks `Asset` and drops a first source, then drops a second source without touching any control, the second result also uses the Asset preset (silhouette on, EGA-16 palette, etc.); the Style selector did not reset.
- AE6. **Covers R11.** Given Style=`Environment` and a 192-long-edge result, the downloaded filename is `pixel-art-environment-192x144.png` (or 192×N where N is the proportional short edge after the landscape crop).

---

## Success Criteria

- A portfolio visitor can produce visibly distinct stylistic outputs by picking a filter — without having to understand or tweak any individual transform — and the difference between filters is obvious to a non-technical viewer.
- A game-asset producer can drop a folder of source photos, pick `Asset` once, and download a sequence of consistent silhouette-cut PNGs that are recognizable as the same source-of-style.
- The v2 default flow (no filter chosen → drop → resize → download) is unchanged. v2 users on a deep-link or returning users see no regression.
- ce-plan inherits enough scope clarity that no v3 product behavior is reinvented at planning time. Per-filter default values, transform pipeline order, and the Custom-indicator UX are committed here.

---

## Scope Boundaries

- **ML / AI segmentation** for "always works" background removal — too heavy for the bundle budget; corner-sample is the v3 quality bar.
- **Subject-aware crop / face detection** for Portrait — center-crop only, same as v2.
- **Per-filter outline color overrides** — Advanced has one global outline color, no per-filter picker. Filters all use black.
- **Posterization in perceptual color spaces** (LAB, OkLCH) — RGB-channel posterization only in v3.
- **Filter preview thumbnails** in the Style dropdown — names only.
- **"Intensity" master knob** that interpolates between filter-off and filter-full — not in v3.
- **Custom filter saving / sharing / URL state** — filters are static catalog data; user can't define their own and persist them. Same as v2's no-URL-state policy.
- **Tile, icon, and sprite-frame filters** — considered during this brainstorm and explicitly deferred. v3 ships the 5 above.
- **Side-by-side multi-filter comparison view** — single output at a time, Style switches replace the result.
- **Background replacement** (swap to a chosen color or image instead of just removing) — only removal in v3.
- **Skin-tone-aware palettes** for Portrait beyond what auto-quantize naturally produces.
- **Animated transitions** between filter changes (instant swap on filter pick).
- **Filter recommendations based on source image content** — user always picks; no auto-suggest.

---

## Key Decisions

- **Filters as presets, not modes.** Picking a filter populates dials; user can tweak afterward. The new transforms also live as individual Advanced controls. This mirrors v2's "controls + curated palettes" mental model and avoids inventing a parallel "filter mode" UX.
- **All 5 filters + all 4 transforms ship together as one v3.** Considered staging into v3 (cartoon/painterly proof of concept) and v3.5 (round out catalog) — rejected because the user has the full surface in mind and partial delivery would force tweaking the architecture mid-sequence.
- **Naive corner-sample for background removal.** ML segmentation rejected for bundle weight; edge-based flood fill considered as a middle ground but corner-sample wins on simplicity and predictability ("works on clean backgrounds; fails honestly otherwise" is a defensible quality bar for a portfolio piece).
- **Style selector lives at the top of the tool** (above the resolution slider), not inside Advanced. Filter is the user's single highest-leverage control once v3 ships; making them dig for it would invert the UX.
- **Palette size becomes a user-controlled value** (8–128) instead of staying fixed at 16. Painterly filters (Art piece, Environment) need bigger palettes to look painterly; relaxing the constraint is cleaner than inventing a separate "soft mode" branch.
- **PNG export with silhouette on preserves alpha.** The v3 framing is game-asset workflow — alpha is the dropped-into-engine output. Without alpha-preserving export, silhouette would be cosmetic only.
- **Filename includes the active Style** so users batching outputs into a folder can sort/group them without re-naming. Ties the file format to the workflow.

---

## Dependencies / Assumptions

- **v2 ships and is the baseline** — v3 builds on v2's protocol, controls, and worker pipeline. v3 cannot be developed in parallel with v2 in any meaningful way.
- The four new transforms are all browser-implementable in pure JS or with `image-q`-class libraries — no new heavy dependency. Edge detection (Sobel) is ~30 lines; posterization is ~5 lines per pixel; corner-sample silhouette is ~10 lines plus a Set lookup; chunky pixels is a render-time concern with no algorithmic complexity. (Unverified: confirmed on conceptual grounds; planning verifies against the actual v2 worker shape.)
- The bundle budget set in v2's `verify-build.sh` (23 KB raw exposed chunk) **will be exceeded** by v3. The new components (Style selector, palette-size slider, four transform controls) plus filter preset data plus 4 new pipeline functions push past 23 KB. Acceptable to raise the ceiling explicitly during planning; budget growth is the price of the new feature surface.
- Curated palette catalog from v2 (Game Boy DMG, PICO-8, EGA-16) is sufficient for v3 — no new curated palettes required. Filter defaults reuse the v2 catalog.

---

## Outstanding Questions

### Resolve Before Planning

- (None — scope is settled for v3.)

### Deferred to Planning

- [Affects R5] **Edge-detection algorithm choice** — Sobel vs Prewitt vs simple difference-of-means. Sobel is the conventional choice; planning may pick alternative if there's a meaningful runtime or quality benefit.
- [Affects R6] **Posterization implementation strategy** — channel-quantization (`Math.floor(c * bands / 256) * (256 / bands)`) is the standard approach; planning verifies it composes cleanly with the existing Wu quantization step that runs after it.
- [Affects R7] **Silhouette tolerance default** — needs an actual perceptual judgment call against real test images. Plan-time tunes a default tolerance value (probably 5–10 of 255 for the corner-sample threshold).
- [Affects R8] **Chunky pixels render strategy** — drawn at native resolution and CSS-scaled vs. pre-baked into the result buffer at NX×NY size. Affects PNG export behavior (does the exported file carry the chunky-pixel size, or its native unscaled size?).
- [Affects R5–R8] **Pipeline order for new transforms** — proposed order: source → saturation → crop → posterization → downscale → outline → quantization → silhouette → chunky-pixels render. Planning confirms or revises based on what produces the best looks at each filter's defaults.
- [Affects R9] **Palette-size UX** — slider, dropdown, or numeric input? Slider feels right for continuous-feeling tuning; dropdown gives visible discrete options. Plan picks.
- [Affects R1] **Style selector UI shape** — radio group, dropdown, or button row with 6 options. The ResolutionSlider precedent is a slider for discrete values; a dropdown is more conventional for named presets. Plan picks.
- [Affects R3] **"Custom (was: X)" indicator visual** — text label only, or chip + label, or color-coded? Plan picks.
