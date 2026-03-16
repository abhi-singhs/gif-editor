import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { cropCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('crop', renderCrop);

let cropState = { x: 0, y: 0, w: 0, h: 0, dragging: false, handle: null };

function renderCrop(panel) {
  const { meta } = getState();

  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Crop</h3>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="crop-x" class="text-xs t-text-secondary block mb-1">X</label>
          <input id="crop-x" type="number" min="0" value="0"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
        <div>
          <label for="crop-y" class="text-xs t-text-secondary block mb-1">Y</label>
          <input id="crop-y" type="number" min="0" value="0"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
        <div>
          <label for="crop-w" class="text-xs t-text-secondary block mb-1">Width</label>
          <input id="crop-w" type="number" min="1" value="${meta.width}"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
        <div>
          <label for="crop-h" class="text-xs t-text-secondary block mb-1">Height</label>
          <input id="crop-h" type="number" min="1" value="${meta.height}"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="crop-ratio px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-ratio="free">Free</button>
        <button class="crop-ratio px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-ratio="1:1">1:1</button>
        <button class="crop-ratio px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-ratio="4:3">4:3</button>
        <button class="crop-ratio px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-ratio="16:9">16:9</button>
      </div>
      <button id="crop-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Crop
      </button>
    </div>
  `;

  // Aspect ratio presets
  for (const btn of document.querySelectorAll('.crop-ratio')) {
    btn.addEventListener('click', () => {
      const ratio = btn.dataset.ratio;
      if (ratio === 'free') return;
      const [rw, rh] = ratio.split(':').map(Number);
      const w = Math.min(meta.width, Math.round(meta.height * (rw / rh)));
      const h = Math.round(w * (rh / rw));
      document.getElementById('crop-w').value = w;
      document.getElementById('crop-h').value = h;
      document.getElementById('crop-x').value = Math.round((meta.width - w) / 2);
      document.getElementById('crop-y').value = Math.round((meta.height - h) / 2);
      drawCropOverlay();
    });
  }

  // Sync inputs to overlay
  for (const id of ['crop-x', 'crop-y', 'crop-w', 'crop-h']) {
    document.getElementById(id).addEventListener('input', drawCropOverlay);
  }

  initCropCanvas();

  document.getElementById('crop-apply').addEventListener('click', async () => {
    const x = parseInt(document.getElementById('crop-x').value);
    const y = parseInt(document.getElementById('crop-y').value);
    const w = parseInt(document.getElementById('crop-w').value);
    const h = parseInt(document.getElementById('crop-h').value);

    if (w < 1 || h < 1) { showToast('Invalid crop area', 'error'); return; }

    showProcessing('Cropping…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(cropCmd('input.gif', 'output.gif', w, h, x, y));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('crop', { x, y, w, h }, result);

      // Re-render crop panel with new dimensions
      renderCrop(panel);

      showToast(`Cropped to ${w}×${h} (${formatSize(result.byteLength)})`, 'success');
    } catch (err) {
      showToast(`Crop failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}

function initCropCanvas() {
  const canvas = document.getElementById('crop-canvas');
  const container = document.getElementById('preview-container');
  if (!canvas || !container) return;

  canvas.classList.remove('hidden');

  const resize = () => {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawCropOverlay();
  };
  resize();
  window.addEventListener('resize', resize);

  // Interaction state
  let mode = null;       // 'draw' | 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'
  let startMouseX, startMouseY;
  let startCropX, startCropY, startCropW, startCropH;

  function getImageMapping() {
    const { meta } = getState();
    const img = document.getElementById('preview-img');
    const imgRect = img.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      meta,
      scaleX: meta.width / imgRect.width,
      scaleY: meta.height / imgRect.height,
      offX: imgRect.left - canvasRect.left,
      offY: imgRect.top - canvasRect.top,
      imgW: imgRect.width,
      imgH: imgRect.height,
    };
  }

  function canvasToGif(canvasX, canvasY) {
    const m = getImageMapping();
    return {
      gx: (canvasX - m.offX) * m.scaleX,
      gy: (canvasY - m.offY) * m.scaleY,
    };
  }

  function getCropRect() {
    return {
      x: parseInt(document.getElementById('crop-x').value) || 0,
      y: parseInt(document.getElementById('crop-y').value) || 0,
      w: parseInt(document.getElementById('crop-w').value) || 0,
      h: parseInt(document.getElementById('crop-h').value) || 0,
    };
  }

  function setCropRect(x, y, w, h) {
    const { meta } = getState();
    x = Math.max(0, Math.min(meta.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(meta.height - 1, Math.round(y)));
    w = Math.max(1, Math.min(meta.width - x, Math.round(w)));
    h = Math.max(1, Math.min(meta.height - y, Math.round(h)));
    document.getElementById('crop-x').value = x;
    document.getElementById('crop-y').value = y;
    document.getElementById('crop-w').value = w;
    document.getElementById('crop-h').value = h;
    drawCropOverlay();
  }

  function hitTest(canvasX, canvasY) {
    const crop = getCropRect();
    const m = getImageMapping();
    const drawX = m.offX + crop.x / m.scaleX;
    const drawY = m.offY + crop.y / m.scaleY;
    const drawW = crop.w / m.scaleX;
    const drawH = crop.h / m.scaleY;
    const ht = 12; // handle hit tolerance in canvas pixels

    // Check corner handles first
    const corners = [
      { name: 'resize-tl', cx: drawX, cy: drawY },
      { name: 'resize-tr', cx: drawX + drawW, cy: drawY },
      { name: 'resize-bl', cx: drawX, cy: drawY + drawH },
      { name: 'resize-br', cx: drawX + drawW, cy: drawY + drawH },
    ];
    for (const c of corners) {
      if (Math.abs(canvasX - c.cx) < ht && Math.abs(canvasY - c.cy) < ht) {
        return c.name;
      }
    }

    // Check inside crop area → move
    if (canvasX >= drawX && canvasX <= drawX + drawW &&
        canvasY >= drawY && canvasY <= drawY + drawH) {
      return 'move';
    }

    return 'draw';
  }

  function updateCursor(canvasX, canvasY) {
    const hit = hitTest(canvasX, canvasY);
    const cursors = {
      'resize-tl': 'nwse-resize', 'resize-br': 'nwse-resize',
      'resize-tr': 'nesw-resize', 'resize-bl': 'nesw-resize',
      'move': 'grab', 'draw': 'crosshair',
    };
    canvas.style.cursor = cursors[hit] || 'crosshair';
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    startMouseX = e.clientX - rect.left;
    startMouseY = e.clientY - rect.top;
    const crop = getCropRect();
    startCropX = crop.x; startCropY = crop.y;
    startCropW = crop.w; startCropH = crop.h;

    mode = hitTest(startMouseX, startMouseY);
    if (mode === 'move') canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    if (!mode) {
      updateCursor(curX, curY);
      return;
    }

    const m = getImageMapping();
    const dx = (curX - startMouseX) * m.scaleX;
    const dy = (curY - startMouseY) * m.scaleY;

    if (mode === 'move') {
      const newX = Math.max(0, Math.min(m.meta.width - startCropW, startCropX + dx));
      const newY = Math.max(0, Math.min(m.meta.height - startCropH, startCropY + dy));
      setCropRect(newX, newY, startCropW, startCropH);
    } else if (mode === 'draw') {
      const { gx: gx1, gy: gy1 } = canvasToGif(startMouseX, startMouseY);
      const { gx: gx2, gy: gy2 } = canvasToGif(curX, curY);
      const x = Math.max(0, Math.min(gx1, gx2));
      const y = Math.max(0, Math.min(gy1, gy2));
      const w = Math.min(m.meta.width - x, Math.abs(gx2 - gx1));
      const h = Math.min(m.meta.height - y, Math.abs(gy2 - gy1));
      setCropRect(x, y, w, h);
    } else if (mode.startsWith('resize-')) {
      let x = startCropX, y = startCropY, w = startCropW, h = startCropH;
      if (mode.includes('r')) { w = Math.max(1, startCropW + dx); }
      if (mode.includes('l')) { x = startCropX + dx; w = startCropW - dx; }
      if (mode.includes('b')) { h = Math.max(1, startCropH + dy); }
      if (mode.includes('t')) { y = startCropY + dy; h = startCropH - dy; }
      if (w < 1) { w = 1; }
      if (h < 1) { h = 1; }
      setCropRect(x, y, w, h);
    }
  });

  canvas.addEventListener('mouseup', () => {
    mode = null;
    canvas.style.cursor = 'crosshair';
  });

  canvas.addEventListener('mouseleave', () => {
    mode = null;
    canvas.style.cursor = 'crosshair';
  });
}

function drawCropOverlay() {
  const canvas = document.getElementById('crop-canvas');
  if (!canvas || canvas.classList.contains('hidden')) return;

  const ctx = canvas.getContext('2d');
  const img = document.getElementById('preview-img');
  const { meta } = getState();

  const imgRect = img.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const offX = imgRect.left - canvasRect.left;
  const offY = imgRect.top - canvasRect.top;
  const scaleX = imgRect.width / meta.width;
  const scaleY = imgRect.height / meta.height;

  const cx = parseInt(document.getElementById('crop-x')?.value || 0);
  const cy = parseInt(document.getElementById('crop-y')?.value || 0);
  const cw = parseInt(document.getElementById('crop-w')?.value || meta.width);
  const ch = parseInt(document.getElementById('crop-h')?.value || meta.height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dim outside crop
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clear crop area
  const drawX = offX + cx * scaleX;
  const drawY = offY + cy * scaleY;
  const drawW = cw * scaleX;
  const drawH = ch * scaleY;
  ctx.clearRect(drawX, drawY, drawW, drawH);

  // Crop border
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(drawX, drawY, drawW, drawH);

  // Corner handles
  const hs = 6;
  ctx.fillStyle = '#818cf8';
  for (const [hx, hy] of [[drawX, drawY], [drawX + drawW, drawY], [drawX, drawY + drawH], [drawX + drawW, drawY + drawH]]) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }
}
