# GIF Editor

A client-side GIF editor that runs entirely in the browser. No uploads, no servers — your files never leave your machine.

**Live:** [https://abhisingh.in/gif-editor/](https://abhisingh.in/gif-editor/)

## Features

- **Resize** — scale with aspect ratio lock and quick presets (25%, 50%, 75%, 200%)
- **Crop** — interactive drag-to-draw, move, and corner-resize crop area with ratio presets (1:1, 4:3, 16:9)
- **Compress** — reduce colors (8–256) and FPS with two-pass palette optimization
- **Speed** — adjust playback speed from 0.25× to 4×
- **Trim** — cut start/end by time
- **Reverse** — reverse frame order
- **Frame Editing** — extract frames, delete or drag-to-reorder, reassemble at custom FPS
- **Filters** — brightness, contrast, saturation, grayscale with presets
- **Slack Emoji Export** — one-click preset that center-crops to square and iteratively compresses to ≤128 KB

## Tech Stack

- **Vanilla JS** (ES modules) — no framework
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin
- **FFmpeg.wasm** — WebAssembly build of FFmpeg for all GIF processing
- **Vite** — dev server and bundler

## Browser Support

Chrome, Edge, and Firefox. Safari is not supported (SharedArrayBuffer restrictions).

## Getting Started

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173` with required COOP/COEP headers.

### Production Build

```bash
npm run build
npm run preview
```

## How It Works

All processing happens client-side via FFmpeg.wasm:

1. **Lazy loading** — FFmpeg.wasm (~25 MB) loads on first GIF drop, with a progress bar
2. **IndexedDB caching** — WASM binary is cached after first download for instant reloads
3. **Two-pass palette** — compress and Slack export use palettegen → paletteuse for quality
4. **Operation replay undo** — stores operation history instead of full blobs, replays from original on undo

## Deployment

Deployed to GitHub Pages via Actions. The `coi-serviceworker` injects `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers required by FFmpeg.wasm on static hosts.

## License

MIT — see [LICENSE](LICENSE).

---

*This project was entirely created by [GitHub Copilot](https://github.com/features/copilot).*
