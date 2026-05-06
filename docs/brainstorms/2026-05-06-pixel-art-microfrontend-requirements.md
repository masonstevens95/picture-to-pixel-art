---
date: 2026-05-06
topic: pixel-art-microfrontend
---

# Pixel-Art Microfrontend (v1)

## Summary

A drag-and-drop, in-browser tool that converts a photo into pixel art at a chosen output resolution. It ships as a Module Federation remote that mounts into the personal portfolio via the existing `RemoteTab` slot, and is also deployable standalone at its own URL. v1 ships drag-drop and the canvas-size chooser only; richer color/aspect controls are deferred.

---

## Problem Frame

The personal portfolio has a project shell (`ProjectPageTemplate`) and an established Module Federation pattern (`RemoteTab` + crash boundaries) that lets standalone projects mount as tabs without leaking shell concerns into each remote. Each project page is most compelling when the embedded experience is interactive enough to feel like a demo, not a screenshot — visitors who land via the portfolio should be able to try the thing in-place.

Today this project is empty scaffolding. The cost of getting it wrong is mostly carrying cost: a remote that bundles its own React/router copies, embeds host chrome assumptions, or depends on a backend would either bloat the portfolio bundle, break when loaded inside the host's tab slot, or block the standalone deploy. Conversely, an over-scoped v1 (five control axes, server-backed conversion, shareable result URLs) burns the project's most fragile resource — the weekend window where it actually gets shipped — before any of it is on the portfolio.

---

## Actors

- A1. **Portfolio visitor**: lands on the project tab inside the portfolio host, expects to try the tool in-place without page transitions.
- A2. **Standalone visitor**: lands on the standalone deploy directly (e.g. via a shared link or search), expects a self-contained app with its own page chrome.

---

## Key Flows

- F1. **Convert via portfolio embed**
  - **Trigger:** A1 navigates to the pixel-art project tab inside the portfolio.
  - **Actors:** A1
  - **Steps:**
    1. Host's `RemoteTab` lazy-loads the federated module.
    2. The remote renders its drop zone and resolution slider inside the host's tab content slot.
    3. A1 drops a photo; the remote shows source and pixelated result side-by-side.
    4. A1 drags the slider; the result re-pixelates live.
    5. A1 downloads the result as PNG.
  - **Outcome:** A1 has a pixel-art PNG on disk; no page transitions, no portfolio chrome disturbed.
  - **Covered by:** R1, R2, R3, R4, R6, R10

- F2. **Convert via standalone deploy**
  - **Trigger:** A2 visits the standalone URL.
  - **Actors:** A2
  - **Steps:**
    1. Standalone shell loads with its own page chrome (title, header).
    2. Same drop zone + slider + side-by-side preview as F1, mounted in the shell's content area.
    3. A2 drops, slides, downloads.
  - **Outcome:** Identical functional result to F1; the shell is the only thing that differs between the two consumers.
  - **Covered by:** R1, R2, R3, R4, R6, R7, R8, R10

---

## Requirements

**Core conversion experience**
- R1. Accept a single image via drag-and-drop into a visible drop zone. File picker fallback (click to choose) is included.
- R2. Provide an output-resolution control covering at minimum 16, 32, 64, 128, and 256 px on the long edge. The control behaves as a live slider — adjusting it re-renders the result without a separate "apply" step.
- R3. Convert in-browser using nearest-neighbor downscale plus auto color-quantization derived from the source image. No fixed palette, no user-supplied palette in v1.
- R4. Display the source image and the pixelated result side-by-side, both visible at once. The result renders crisp (no smoothing) at any display size.
- R5. Preserve the source image's aspect ratio when downscaling. No aspect-ratio override in v1.
- R6. Provide a single export action that downloads the result as a PNG at its native pixel resolution (e.g. 64×64). No upscaled export variant in v1.

**Dual-deploy surface**
- R7. The remote exposes a single default-exported React component, sufficient to render the full v1 experience without props from the host. The component owns no top-level routing.
- R8. The same component renders correctly inside the portfolio's `RemoteTab` slot **and** inside the standalone shell with no consumer-specific branches.
- R9. The standalone shell (the harness) provides minimum chrome: page title, a header identifying the tool, and a Tailwind dark/neutral aesthetic consistent with the portfolio. No additional pages, no nav.
- R10. Both deployments are pure static hosts — no backend, no upload endpoints, no runtime config that requires a server.

**Behavior under host integration**
- R11. The remote does not bundle React, react-dom (or any other host-shared singletons) into its output; it consumes them as MF shared dependencies. The remote works in the standalone harness via the same shared-deps mechanism.
- R12. The remote tolerates being unmounted and remounted without leaking timers, object URLs, or in-flight image decode work.

---

## Acceptance Examples

- AE1. **Covers R2, R4.** Given a 4000×3000 photo dropped into the zone, when the visitor drags the resolution slider from 32 to 128, the result panel updates within a couple of frames at each stop, and the source panel does not move or resize.
- AE2. **Covers R6.** Given a result rendered at 64 px on the long edge from a landscape photo, when the visitor clicks export, the downloaded PNG is exactly 64 px on its long edge with the source aspect ratio preserved (e.g. 64×48).
- AE3. **Covers R8, R9.** Given the standalone deploy URL, when the visitor loads the page cold, the tool is interactive without the portfolio's `ProjectPageTemplate` chrome and without any console errors about missing host context.
- AE4. **Covers R12.** Given the portfolio host where the visitor switches between the pixel-art tab and a sibling tab three times, when DevTools memory is sampled, no source-image object URL or canvas reference is retained from prior mounts.

---

## Success Criteria

- A portfolio visitor can drop a photo, drag the resolution slider, and download a PNG without ever seeing a loading screen beyond the initial tab-switch suspense fallback.
- The same compiled remote loads in both the portfolio and the standalone deploy, and visual diffs between the two are limited to the surrounding chrome (header, page background outside the tool's frame).
- ce-plan inherits enough scope clarity that it does not need to invent v1 product behavior; only "how" decisions (build tool, MF plugin choice, quantization algorithm, deploy target) remain.
- The remote bundle does not double-ship React or react-dom when loaded by the portfolio host.

---

## Scope Boundaries

- Aspect-ratio override (square / portrait / landscape / custom) — deferred past v1.
- Curated color palettes (NES, Game Boy, EGA, custom) — deferred past v1.
- Brand-color locking (output must use specific hex codes) — deferred past v1.
- Saturation control — deferred past v1.
- Server-backed or hybrid conversion — explicitly rejected; client-only is a hard v1 constraint.
- Shareable result URLs / persistent gallery / conversion history — would require a backend; out of scope.
- Multi-image batch conversion — out of v1.
- Animated transitions between resolutions (morphing source into pixels) — out of v1.
- Authentication, accounts, analytics — none in v1.
- SEO beyond a basic title and description on the standalone deploy — out of v1.
- Mobile-optimized layouts beyond "doesn't break on phones" — assume desktop-primary for a portfolio demo.
- Dithering, palette mapping, or any non-nearest-neighbor downscale strategy — deferred past v1.

---

## Key Decisions

- **Module Federation, not iframe / npm package / web component.** The portfolio host already runs a working MF integration with `RemoteTab` and shared error boundaries; matching that pattern means zero new infrastructure on the host side and lets the remote be a normal React component rather than a sandboxed surface.
- **Single default-exported component as the expose surface.** Matches the `RemoteTab` contract (`() => Promise<{ default: ComponentType }>`); avoids inventing a multi-export plugin protocol that v1 doesn't need.
- **Two consumer targets: portfolio embed + standalone deploy.** Forces the remote to be self-sufficient (no implicit host context) and gives the project a working cold-load URL to share independently of the portfolio.
- **Client-only conversion in the browser.** Both deploys stay pure static; no backend, no CORS, no privacy concerns about user images leaving the device. v1 algorithms (downscale + quantize) fit comfortably in-browser.
- **Side-by-side live-slider UI, not configure-then-export.** Leans into the "interactive demo" feel appropriate for a portfolio piece; the slider doubles as the only required control surface in v1.
- **Auto-quantize from source image, no palette UI in v1.** Removes the hardest visual-quality decision (palette selection) from v1 while still producing a defensible default result.
- **Native-resolution export only.** Avoids settling export-size conventions before there's user feedback; viewers can scale in their own editor.
- **Tailwind dark/neutral standalone shell.** Matches portfolio visual language; no separate design exercise for the standalone shell.
- **`apps/harness` is the standalone deploy, not a throwaway dev tool.** A single shell serves both dev iteration and production standalone use, which keeps the remote honest about not depending on the portfolio host.

---

## Dependencies / Assumptions

- The portfolio host's `RemoteTab` lazy-imports a federated module and wraps it in `Suspense` + a crash boundary; the remote does not need to provide its own top-level error boundary.
- The portfolio host treats React and react-dom as Module Federation shared singletons. The remote will declare matching shared-deps so it does not double-ship them. (Unverified against host config — flagged for planning.)
- The portfolio expects the remote to render flat content suitable for a tab slot, with no top-level `<Routes>` or layout chrome. (Confirmed by the supplied `RemoteTab` snippet.)
- The standalone deploy is hosted on a static target (Vercel / Netlify / Cloudflare Pages / GitHub Pages); no server runtime is assumed.
- React 18+ and a Module Federation–capable bundler (Vite + `@originjs/vite-plugin-federation`, Rspack's MF plugin, or Webpack 5) are assumed to be the build foundation. The exact choice is a planning decision.

---

## Outstanding Questions

### Resolve Before Planning

- (None — scope is settled for v1.)

### Deferred to Planning

- [Affects R11][Technical] Which MF-capable bundler will the remote build with, and does it match the portfolio host's bundler? Mismatched MF runtimes (Webpack vs Vite plugin vs Rspack) can fail at module-import time even with matching shared-deps.
- [Affects R3][Needs research] Quantization algorithm choice — naive median-cut, k-means in LAB, or a small WASM library — and whether nearest-neighbor downscale alone is sufficient before quantization or whether a pre-blur improves results at low resolutions.
- [Affects R7, R8] Does the exposed component accept any optional props (theme override, max-width hint) for the host, or is it fully self-contained? Default to self-contained; revisit only if the portfolio shell needs to influence layout.
- [Affects R10] Specific deploy targets for the portfolio's MF host and the standalone — are they on the same domain (simplifying CORS for the federated chunk fetch) or different domains?
- [Affects R12] Object-URL lifecycle and `<canvas>` cleanup strategy on unmount. Concrete pattern to validate during implementation rather than design here.
