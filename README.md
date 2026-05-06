# picture-to-pixel-art

Drag and drop a photo, get pixel art back.

## What it does

Upload an image and convert it into pixel art with full control over the look:

- **Canvas size** — pick the output resolution in pixels (e.g. 32×32, 64×64, 128×128)
- **Aspect ratio** — square, portrait, landscape, or custom
- **Color palette** — choose from curated palettes or supply your own
- **Brand colors** — lock specific hex codes the output must use (logos, brand kits)
- **Saturation** — dial vibrancy up or down independent of palette

## How it works

1. Drop a photo into the canvas.
2. Set canvas size and aspect ratio.
3. Pick a palette, or paste brand color hex codes.
4. Adjust saturation.
5. Export the pixel art.

## Status

Early development.

## Development

A Dockerfile and `.devcontainer` config are included for a reproducible environment. To run the dev container locally:

```sh
./docker-run.sh
```
