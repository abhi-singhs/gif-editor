import { getState } from '../utils/state.js';
import { trimCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import * as player from '../components/player.js';
import { panelHeader, button, note } from '../ui/components.js';

const tool = {
  id: 'trim',
  label: 'Trim',
  iconName: 'trim',
  hue: 'rose',
  hint: 'Keep just the best part.',
  render: renderTrim,
  exit: exitTrim,
};
registerTool(tool);

/** Half the handle width: the range thumbs are inset by this much at both ends */
const THUMB_HALF = 8;

let cleanup = null;

function exitTrim() {
  cleanup?.();
  cleanup = null;
  player.setLoopRange(null);
}

/** Cumulative start time (ms) of each frame boundary 0..n */
function boundaries(delays) {
  const cum = [0];
  for (const d of delays) cum.push(cum[cum.length - 1] + (d || 100));
  return cum;
}

const secs = (ms) => `${(ms / 1000).toFixed(2)}s`;

function renderTrim(panel) {
  const { meta } = getState();
  const n = meta.frames;
  const cum = boundaries(meta.delays.length === n ? meta.delays : Array(n).fill(meta.duration / n || 100));

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4" data-hue="rose">
      <div class="relative h-16 select-none" id="trim-track">
        <div class="absolute inset-y-0 rounded-xl overflow-hidden bg-surface-2" style="left:${THUMB_HALF}px;right:${THUMB_HALF}px">
          <canvas id="trim-strip" class="w-full h-full block"></canvas>
          <div id="trim-dim-l" class="absolute inset-y-0 left-0 bg-canvas/75"></div>
          <div id="trim-dim-r" class="absolute inset-y-0 right-0 bg-canvas/75"></div>
          <div id="trim-playhead" class="absolute inset-y-0 w-0.5 bg-ink/80 pointer-events-none"></div>
        </div>
        <input id="trim-start" type="range" class="dual-range" min="0" max="${n}" step="1" value="0" aria-label="Start frame" />
        <input id="trim-end" type="range" class="dual-range" min="0" max="${n}" step="1" value="${n}" aria-label="End frame" />
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-2xl bg-surface-2 p-2"><p class="text-xs font-bold text-muted">Start</p><p id="trim-start-label" class="text-sm font-extrabold tabular-nums"></p></div>
        <div class="rounded-2xl bg-surface-2 p-2"><p class="text-xs font-bold text-muted">End</p><p id="trim-end-label" class="text-sm font-extrabold tabular-nums"></p></div>
        <div class="rounded-2xl hue-chip p-2"><p class="text-xs font-bold opacity-80">Keeps</p><p id="trim-len-label" class="text-sm font-extrabold tabular-nums"></p></div>
      </div>
      ${button({ id: 'trim-apply', label: 'Apply trim', iconName: 'check', variant: 'primary', block: true })}
      ${player.isFrameAccurate()
        ? note('The preview loops your selection. Handles snap to frames.')
        : note('Live loop preview isn’t available in this browser. The handles still snap to frames.')}
    </div>
  `;

  const startInput = document.getElementById('trim-start');
  const endInput = document.getElementById('trim-end');
  const pct = (v) => `${(v / n) * 100}%`;

  const update = (changed) => {
    let s = parseInt(startInput.value, 10);
    let e = parseInt(endInput.value, 10);
    // Keep at least one frame selected
    if (e - s < 1) {
      if (changed === startInput) s = startInput.value = e - 1;
      else e = endInput.value = s + 1;
    }
    document.getElementById('trim-dim-l').style.width = pct(s);
    document.getElementById('trim-dim-r').style.width = pct(n - e);
    document.getElementById('trim-start-label').textContent = `#${s + 1} · ${secs(cum[s])}`;
    document.getElementById('trim-end-label').textContent = `#${e} · ${secs(cum[e])}`;
    document.getElementById('trim-len-label').textContent = `${e - s} fr · ${secs(cum[e] - cum[s])}`;
    player.setLoopRange([s, e]);
    if (changed) player.seek(changed === endInput ? e - 1 : s);
  };

  startInput.addEventListener('input', () => update(startInput));
  endInput.addEventListener('input', () => update(endInput));
  update(null);

  // Filmstrip thumbnails (once frames are decoded) and a playhead
  const strip = document.getElementById('trim-strip');
  let stripDone = drawStrip(strip, n, meta);
  const offFrame = player.on('frame', () => {
    if (!stripDone) stripDone = drawStrip(strip, n, meta);
    const { index } = player.getFrameInfo();
    document.getElementById('trim-playhead').style.left = `${((index + 0.5) / n) * 100}%`;
  });
  cleanup = offFrame;

  document.getElementById('trim-apply').addEventListener('click', () => {
    const s = parseInt(startInput.value, 10);
    const e = parseInt(endInput.value, 10);
    if (s === 0 && e === n) { showToast('Drag the handles to choose what to keep', 'info'); return; }

    // Nudge the cut points half a millisecond inside so FFmpeg's timestamp
    // comparisons land cleanly on frame boundaries
    const start = s > 0 ? Math.max(0, cum[s] / 1000 - 0.0005) : 0;
    const duration = (cum[e] - cum[s]) / 1000 - 0.0005;

    applyEdit({
      label: `Trim to ${e - s} frames`,
      busy: 'Trimming…',
      passes: [trimCmd('input.gif', 'output.gif', Number(start.toFixed(4)), Number(duration.toFixed(4)))],
      success: (result) => `Trimmed to ${secs(cum[e] - cum[s])} (${formatSize(result.byteLength)})`,
    });
  });
}

/** Tile frame thumbnails across the strip; returns true once real thumbnails were drawn */
function drawStrip(canvas, n, meta) {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return false;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const haveFrames = player.isFrameAccurate() && player.getBitmap(n - 1) !== null;
  if (!haveFrames) {
    // Placeholder: one alternating stripe per frame
    const w = cssW / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(244, 63, 94, 0.22)' : 'rgba(244, 63, 94, 0.12)';
      ctx.fillRect(i * w, 0, Math.ceil(w), cssH);
    }
    return false;
  }

  const tileW = Math.max(24, cssH * (meta.width / meta.height));
  const tiles = Math.ceil(cssW / tileW);
  for (let k = 0; k < tiles; k++) {
    const frame = Math.min(n - 1, Math.floor(((k + 0.5) * tileW / cssW) * n));
    const bmp = player.getBitmap(frame);
    if (!bmp) continue;
    // Cover-fit the frame into the tile
    const s = Math.max(tileW / bmp.width, cssH / bmp.height);
    const sw = tileW / s, sh = cssH / s;
    ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, k * tileW, 0, tileW, cssH);
  }
  return true;
}
