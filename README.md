# GIF Editor

A client-side GIF editor that runs entirely in the browser. No uploads, no servers — your files never leave your machine.

**Live:** [https://abhisingh.in/gif-editor/](https://abhisingh.in/gif-editor/)

## Features

- **Resize**: scale with an aspect-ratio lock and quick presets (25%, 50%, 75%, 200%, Fit 128)
- **Crop**: draw, move and resize the crop box with mouse or touch, with ratio presets (1:1, 4:3, 16:9, 9:16) and a rule-of-thirds grid
- **Trim**: drag handles on a filmstrip timeline that snap to frames, with a live looping preview of your selection
- **Speed**: 0.25× to 4×, previewed live before you apply it
- **Reverse**: preview the GIF playing backwards, then apply
- **Frames**: delete or reorder frames by drag-and-drop, multi-select, or keyboard, then rebuild at a chosen frame rate
- **Filters**: brightness, contrast, saturation, grayscale and visual presets, with a live preview
- **Compress**: color count and frame rate, with Light / Balanced / Tiny presets and two-pass palette optimization
- **Slack Emoji Export**: one click center-crops to a square and iteratively compresses to ≤128 KB
- **Batch Slack Export**: drop several GIFs and download them all Slack-ready in one `.zip`, with original filenames kept

### Editing experience

- **Frame-accurate player**: play/pause, step and scrub through frames, and zoom from fit up to 800% with crisp pixels on a transparency checkerboard
- **Compare**: see the original side by side with your edit, plus the size change
- **Instant undo/redo**: snapshot history with a clickable list of every step
- **Drop or paste anywhere**: drag GIFs onto the window or paste with ⌘/Ctrl+V at any time
- **Background engine loading**: FFmpeg warms up as soon as a GIF is loaded, and its progress shows in the header
- **Light, dark and system themes**, with a responsive layout that works on phones

## Keyboard Shortcuts

| Keys | Action |
| --- | --- |
| `1`–`8` | Open a tool |
| `Esc` | Close the tool |
| `Space` | Play / pause |
| `,` / `.` | Previous / next frame |
| `+` / `-` / `0` | Zoom in / out / toggle fit |
| `\` | Compare with original |
| `⌘/Ctrl+Z`, `⌘/Ctrl+Shift+Z` | Undo / redo |
| `⌘/Ctrl+S` | Download |
| `?` | Show all shortcuts |

## Tech Stack

- **Vanilla JS** (ES modules) — no framework
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin, with semantic theme tokens
- **Lucide** icons and self-hosted **Nunito** font
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
4. **Snapshot undo** — each edit's result is kept in a capped history (30 steps / 256 MB), so undo and redo are instant
5. **WebCodecs playback** — the stage decodes frames with `ImageDecoder` for frame stepping and live previews, falling back to a plain `<img>` where unavailable

## Deployment

Deployed to GitHub Pages via Actions. The `coi-serviceworker` injects `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers required by FFmpeg.wasm on static hosts.

## License

MIT — see [LICENSE](LICENSE).

---

*This project was entirely created by [GitHub Copilot](https://github.com/features/copilot).*
