import { getState } from '../utils/state.js';
import { cropCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import * as player from '../components/player.js';
import { panelHeader, numberField, segmented, bindSegmented, button, note } from '../ui/components.js';

const tool = {
  id: 'crop',
  label: 'Crop',
  iconName: 'crop',
  hue: 'amber',
  hint: 'Cut away the edges you don’t need.',
  render: renderCrop,
  exit: exitCrop,
};
registerTool(tool);

const RATIOS = [
  { value: 'free', label: 'Free' },
  { value: '1', label: '1:1' },
  { value: '1.3333', label: '4:3' },
  { value: '1.7778', label: '16:9' },
  { value: '0.5625', label: '9:16' },
];

/** Overlay canvas extends this far (CSS px) beyond the GIF so edge handles stay grabbable */
const PAD = 12;
const HANDLE_HIT = 14;

let rect = { x: 0, y: 0, w: 0, h: 0 };
let ratio = null;       // locked aspect ratio (w/h) or null for free
let cleanup = null;     // tears down listeners on exit

function renderCrop(panel) {
  const { meta } = getState();
  rect = { x: 0, y: 0, w: meta.width, h: meta.height };
  ratio = null;

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      ${segmented({ id: 'crop-ratio', label: 'Aspect ratio', options: RATIOS, value: 'free' })}
      <div class="grid grid-cols-2 gap-2">
        ${numberField({ id: 'crop-x', label: 'X', value: 0, min: 0, suffix: 'px' })}
        ${numberField({ id: 'crop-y', label: 'Y', value: 0, min: 0, suffix: 'px' })}
        ${numberField({ id: 'crop-w', label: 'Width', value: meta.width, min: 1, suffix: 'px' })}
        ${numberField({ id: 'crop-h', label: 'Height', value: meta.height, min: 1, suffix: 'px' })}
      </div>
      <div class="flex gap-2">
        ${button({ id: 'crop-reset', label: 'Reset', variant: 'soft' })}
        <div class="flex-1">${button({ id: 'crop-apply', label: 'Apply crop', iconName: 'check', variant: 'primary', block: true })}</div>
      </div>
      ${note('Drag on the GIF to draw a box. Drag inside it to move it, or drag the handles to resize.')}
    </div>
  `;

  bindSegmented('crop-ratio', (value) => {
    ratio = value === 'free' ? null : parseFloat(value);
    if (ratio) {
      // Largest centered box with this ratio
      let w = meta.width;
      let h = w / ratio;
      if (h > meta.height) { h = meta.height; w = h * ratio; }
      setRect({ x: (meta.width - w) / 2, y: (meta.height - h) / 2, w, h });
    }
  });

  for (const id of ['crop-x', 'crop-y', 'crop-w', 'crop-h']) {
    document.getElementById(id).addEventListener('input', () => {
      const v = (k) => parseInt(document.getElementById(`crop-${k}`).value, 10) || 0;
      rect = clampRect({ x: v('x'), y: v('y'), w: v('w'), h: v('h') });
      draw();
    });
  }

  document.getElementById('crop-reset').addEventListener('click', () => {
    setRect({ x: 0, y: 0, w: meta.width, h: meta.height });
  });

  document.getElementById('crop-apply').addEventListener('click', () => {
    const { x, y, w, h } = rect;
    if (w < 1 || h < 1) { showToast('Draw a crop box first', 'error'); return; }
    if (w === meta.width && h === meta.height) { showToast('The crop box covers the whole GIF. Shrink it first.', 'info'); return; }
    applyEdit({
      label: `Crop to ${w}×${h}`,
      busy: 'Cropping…',
      passes: [cropCmd('input.gif', 'output.gif', w, h, x, y)],
      success: (result) => `Cropped to ${w}×${h} (${formatSize(result.byteLength)})`,
    });
  });

  enterCrop();
}

function exitCrop() {
  cleanup?.();
  cleanup = null;
  document.getElementById('crop-canvas').classList.add('hidden');
}

// ---- Geometry ----

function clampRect({ x, y, w, h }) {
  const { meta } = getState();
  x = Math.max(0, Math.min(meta.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(meta.height - 1, Math.round(y)));
  w = Math.max(1, Math.min(meta.width - x, Math.round(w)));
  h = Math.max(1, Math.min(meta.height - y, Math.round(h)));
  return { x, y, w, h };
}

function setRect(r) {
  rect = clampRect(r);
  for (const k of ['x', 'y', 'w', 'h']) document.getElementById(`crop-${k}`).value = rect[k];
  draw();
}

/**
 * Resize `start` by dragging edges named in `mode` (any of n/s/e/w) by (dx, dy) GIF px,
 * keeping the opposite edges anchored and honoring the locked ratio.
 */
function resizeRect(start, mode, dx, dy) {
  const { meta } = getState();
  let left = start.x, top = start.y;
  let right = start.x + start.w, bottom = start.y + start.h;
  if (mode.includes('w')) left = Math.min(right - 1, Math.max(0, left + dx));
  if (mode.includes('e')) right = Math.max(left + 1, Math.min(meta.width, right + dx));
  if (mode.includes('n')) top = Math.min(bottom - 1, Math.max(0, top + dy));
  if (mode.includes('s')) bottom = Math.max(top + 1, Math.min(meta.height, bottom + dy));
  let w = right - left;
  let h = bottom - top;

  if (ratio) {
    if (mode === 'n' || mode === 's') w = h * ratio;
    else if (mode === 'e' || mode === 'w') h = w / ratio;
    else if (w / h > ratio) w = h * ratio;
    else h = w / ratio;

    const maxW = mode.includes('w') ? right : meta.width - left;
    const maxH = mode.includes('n') ? bottom : meta.height - top;
    w = Math.min(w, maxW, maxH * ratio);
    h = w / ratio;
    if (mode.includes('w')) left = right - w;
    if (mode.includes('n')) top = bottom - h;
  }
  return { x: left, y: top, w, h };
}

// ---- Overlay interaction ----

function enterCrop() {
  exitCrop();
  const canvas = document.getElementById('crop-canvas');
  canvas.classList.remove('hidden');
  const controller = new AbortController();
  const { signal } = controller;

  /** CSS px (relative to canvas) → GIF px */
  const toGif = (cx, cy) => {
    const s = player.getScale();
    return { gx: (cx - PAD) / s, gy: (cy - PAD) / s };
  };
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  };

  const hitTest = (cx, cy) => {
    const s = player.getScale();
    const l = PAD + rect.x * s, t = PAD + rect.y * s;
    const r = l + rect.w * s, b = t + rect.h * s;
    const near = (a, v) => Math.abs(a - v) < HANDLE_HIT;
    const inX = cx > l - HANDLE_HIT && cx < r + HANDLE_HIT;
    const inY = cy > t - HANDLE_HIT && cy < b + HANDLE_HIT;
    let mode = '';
    if (inX && near(cy, t)) mode += 'n';
    else if (inX && near(cy, b)) mode += 's';
    if (inY && near(cx, l)) mode += 'w';
    else if (inY && near(cx, r)) mode += 'e';
    if (mode) return mode;
    // A box covering the whole GIF can't move, so dragging inside it draws a new one
    const { meta } = getState();
    const full = rect.w === meta.width && rect.h === meta.height;
    if (!full && cx > l && cx < r && cy > t && cy < b) return 'move';
    return 'draw';
  };

  const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', move: 'move', draw: 'crosshair' };

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const { cx, cy } = local(e);
    const { gx, gy } = toGif(cx, cy);
    drag = { mode: hitTest(cx, cy), cx, cy, gx, gy, start: { ...rect } };
    canvas.setPointerCapture(e.pointerId);
    if (drag.mode === 'move') canvas.style.cursor = 'grabbing';
  }, { signal });

  canvas.addEventListener('pointermove', (e) => {
    const { cx, cy } = local(e);
    if (!drag) {
      canvas.style.cursor = CURSORS[hitTest(cx, cy)];
      return;
    }
    const s = player.getScale();
    const dx = (cx - drag.cx) / s;
    const dy = (cy - drag.cy) / s;
    const { meta } = getState();

    if (drag.mode === 'move') {
      setRect({
        ...drag.start,
        x: Math.max(0, Math.min(meta.width - drag.start.w, drag.start.x + dx)),
        y: Math.max(0, Math.min(meta.height - drag.start.h, drag.start.y + dy)),
      });
    } else if (drag.mode === 'draw') {
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      // Drawing = resizing a zero-size box anchored at the press point
      const anchor = { x: Math.max(0, Math.min(meta.width, drag.gx)), y: Math.max(0, Math.min(meta.height, drag.gy)), w: 0, h: 0 };
      const mode = (dy < 0 ? 'n' : 's') + (dx < 0 ? 'w' : 'e');
      setRect(resizeRect(anchor, mode, dx, dy));
    } else {
      setRect(resizeRect(drag.start, drag.mode, dx, dy));
    }
  }, { signal });

  const end = () => {
    drag = null;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', end, { signal });
  canvas.addEventListener('pointercancel', end, { signal });

  const offLayout = player.on('layout', draw);
  cleanup = () => {
    controller.abort();
    offLayout();
  };
  requestAnimationFrame(draw);
}

function draw() {
  const canvas = document.getElementById('crop-canvas');
  if (canvas.classList.contains('hidden')) return;
  const wrap = player.getMediaWrap();
  const s = player.getScale();
  const cssW = wrap.clientWidth + PAD * 2;
  const cssH = wrap.clientHeight + PAD * 2;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const l = PAD + rect.x * s, t = PAD + rect.y * s;
  const w = rect.w * s, h = rect.h * s;
  const accent = '#f59e0b';

  // Dim everything outside the crop box (only over the GIF itself)
  ctx.fillStyle = 'rgba(15, 10, 30, 0.55)';
  ctx.beginPath();
  ctx.rect(PAD, PAD, wrap.clientWidth, wrap.clientHeight);
  ctx.rect(l, t, w, h);
  ctx.fill('evenodd');

  // Rule-of-thirds grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(l + (w * i) / 3, t); ctx.lineTo(l + (w * i) / 3, t + h);
    ctx.moveTo(l, t + (h * i) / 3); ctx.lineTo(l + w, t + (h * i) / 3);
  }
  ctx.stroke();

  // Border
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, w, h);

  // Corner handles (round) and edge handles (pills)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  for (const [hx, hy] of [[l, t], [l + w, t], [l, t + h], [l + w, t + h]]) {
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const pill = (x, y, horizontal) => {
    ctx.beginPath();
    ctx.roundRect(horizontal ? x - 9 : x - 3, horizontal ? y - 3 : y - 9, horizontal ? 18 : 6, horizontal ? 6 : 18, 3);
    ctx.fill();
    ctx.stroke();
  };
  if (w > 40) { pill(l + w / 2, t, true); pill(l + w / 2, t + h, true); }
  if (h > 40) { pill(l, t + h / 2, false); pill(l + w, t + h / 2, false); }

  // Size label
  const label = `${rect.w} × ${rect.h}`;
  ctx.font = '700 12px "Nunito Variable", system-ui, sans-serif';
  const tw = ctx.measureText(label).width + 12;
  const ly = t + h + 26 < cssH ? t + h + 8 : t + 8;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(l + w / 2 - tw / 2, ly, tw, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#1f1a2e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, l + w / 2, ly + 9.5);
}
