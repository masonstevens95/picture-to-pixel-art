# Deployment

This repo ships two static deployments that share one codebase:

- `apps/remote` — the Module Federation remote loaded by your portfolio at runtime.
- `apps/harness` — the standalone web app at its own URL.

Both are pure static hosts. There is no backend. All conversion runs in the visitor's browser.

---

## Build outputs

```bash
pnpm build
```

Produces:

- `apps/remote/dist/` — `remoteEntry.js`, the exposed `PixelArtApp` chunk, MF shared-deps stubs, CSS, and an `index.html` for standalone preview.
- `apps/harness/dist/` — `index.html` plus a single JS+CSS bundle.

Each app's build runs `scripts/verify-build.sh` after `vite build`:

- The remote's verify confirms `remoteEntry.js` exists, the exposed `PixelArtApp` chunk is small (no React bundled), and no `ReactCurrentDispatcher` symbols leak into the chunk.
- The harness's verify confirms the bundle contains no `__mfe_internal__` or `__federation__` artifacts (the harness must NOT also be configured as an MF remote).

---

## Deploying the remote

### CORS is mandatory

The portfolio host fetches `remoteEntry.js` cross-origin at runtime. Browsers block that request unless the asset responds with `Access-Control-Allow-Origin: *` (or the explicit portfolio origin). Static hosts do not set this by default for JS files.

Sample header configs are checked in:

- `apps/remote/vercel.json` — Vercel
- `apps/remote/_headers` — Netlify and Cloudflare Pages share this format

Both cover:

- `/remoteEntry.js` — the federation entry. Short cache (5 min) so version flips propagate quickly.
- `/mf-entry-bootstrap-*.js` — short cache for the same reason.
- `/assets/*` — long cache (1 year, immutable) since Vite hashes filenames.
- `/@mf-types*` — types zip emitted by `@module-federation/vite` for host typecheck consumption.

### Deploy commands

```bash
# Vercel
vercel --prod apps/remote

# Netlify CLI
netlify deploy --prod --dir apps/remote/dist

# Cloudflare Pages (via Wrangler)
wrangler pages deploy apps/remote/dist
```

Or wire `apps/remote` as a project in the host's UI with `pnpm --filter @pixelart/remote build` as the build command and `apps/remote/dist` as the publish directory.

### Subpath hosting

Default `base` in `apps/remote/vite.config.ts` is `/`. If you host the remote at a subpath (e.g. `https://example.com/pixel-art/`), you must:

1. Set `base: "/pixel-art/"` in `apps/remote/vite.config.ts`.
2. Smoke-test locally with `pnpm --filter @pixelart/remote build && pnpm --filter @pixelart/remote preview --base /pixel-art/` before deploying — `@module-federation/vite` has open issues (#159, #217) where the remote entry's internal chunk URLs do not respect `base` correctly, and the failure mode is "host loads remoteEntry.js fine but its chunks 404 at runtime."

---

## Deploying the harness

```bash
pnpm --filter @pixelart/harness build
# Deploy apps/harness/dist via your static host of choice.
```

No special headers required — the harness is a normal SPA, no cross-origin fetches.

---

## Wiring the host portfolio

The portfolio repo loads the remote via the existing `RemoteTab` pattern. Add (or extend) the calculator-style `tabs` config with:

```ts
{
  slug: "pixel-art",
  label: "Picture to Pixel Art",
  kind: "remote",
  importer: () => import("remote/PixelArtApp"),
}
```

And in the host's MF configuration, add the remote URL:

```ts
remotes: {
  remote: "remote@https://<your-remote-deploy>.example.com/remoteEntry.js",
}
```

(The local alias `remote` is conventional; `remote/PixelArtApp` resolves to the exposed module.)

### TypeScript declaration

`@module-federation/vite` auto-emits `.d.ts` for exposed modules under `dist/@mf-types/`. The host can either:

- Configure the host's MF plugin to auto-fetch types from the remote (recommended; see `@module-federation/native-federation-typescript`), OR
- Add a manual ambient declaration to the host repo:

```ts
// host/src/remote.d.ts
declare module "remote/PixelArtApp" {
  import type { ComponentType } from "react";
  const PixelArtApp: ComponentType;
  export default PixelArtApp;
}
```

The exposed component takes no props.

---

## Smoke test (post-deploy)

Run after every fresh deploy to confirm the host can actually load the remote:

1. **Build is fresh.** `pnpm --filter @pixelart/remote build` exits 0 and the verify script prints `VERIFY OK`.
2. **Remote is reachable.** `curl -sI https://<remote-deploy>/remoteEntry.js` returns 200.
3. **CORS is set.** `curl -sI -H "Origin: https://<portfolio>" https://<remote-deploy>/remoteEntry.js | grep -i access-control-allow-origin` returns either `*` or the portfolio's exact origin.
4. **Standalone harness loads.** Visit the harness URL cold; the drop zone, slider, and preview render with no console errors.
5. **End-to-end flow.** Drop a JPEG, drag the resolution slider through 16 → 256, and click Download PNG. Confirm the downloaded file opens at its native pixel size.

If any step fails, do not promote the host integration — the remote is not deploy-ready.
