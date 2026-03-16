import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { resizeCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('resize', renderResize);

function renderResize(panel) {
  const { meta } = getState();
  const aspectRatio = meta.width / meta.height;

  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Resize</h3>
    <div class="space-y-3">
      <div class="flex gap-2 items-end">
        <div class="flex-1">
          <label for="resize-w" class="text-xs t-text-secondary block mb-1">Width</label>
          <input id="resize-w" type="number" min="1" max="4096" value="${meta.width}"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
        <button id="resize-lock" class="pb-1.5 text-lg" aria-label="Lock aspect ratio" aria-pressed="true"><span aria-hidden="true">🔗</span></button>
        <div class="flex-1">
          <label for="resize-h" class="text-xs t-text-secondary block mb-1">Height</label>
          <input id="resize-h" type="number" min="1" max="4096" value="${meta.height}"
            class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
        </div>
      </div>
      <div class="flex gap-2">
        <button class="resize-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-scale="0.25">25%</button>
        <button class="resize-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-scale="0.5">50%</button>
        <button class="resize-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-scale="0.75">75%</button>
        <button class="resize-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-scale="2">200%</button>
      </div>
      <button id="resize-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Resize
      </button>
    </div>
  `;

  let locked = true;
  const wInput = document.getElementById('resize-w');
  const hInput = document.getElementById('resize-h');
  const lockBtn = document.getElementById('resize-lock');

  lockBtn.addEventListener('click', () => {
    locked = !locked;
    lockBtn.innerHTML = `<span aria-hidden="true">${locked ? '🔗' : '🔓'}</span>`;
    lockBtn.setAttribute('aria-pressed', String(locked));
  });

  wInput.addEventListener('input', () => {
    if (locked) hInput.value = Math.round(parseInt(wInput.value) / aspectRatio);
  });
  hInput.addEventListener('input', () => {
    if (locked) wInput.value = Math.round(parseInt(hInput.value) * aspectRatio);
  });

  for (const btn of document.querySelectorAll('.resize-preset')) {
    btn.addEventListener('click', () => {
      const scale = parseFloat(btn.dataset.scale);
      wInput.value = Math.round(meta.width * scale);
      hInput.value = Math.round(meta.height * scale);
    });
  }

  document.getElementById('resize-apply').addEventListener('click', async () => {
    const w = parseInt(wInput.value);
    const h = parseInt(hInput.value);
    if (!w || !h || w < 1 || h < 1) { showToast('Invalid dimensions', 'error'); return; }

    showProcessing('Resizing…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(resizeCmd('input.gif', 'output.gif', w, h));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('resize', { w, h }, result);

      // Re-render panel with new dimensions
      renderResize(panel);

      showToast(`Resized to ${w}×${h} (${formatSize(result.byteLength)})`, 'success');
    } catch (err) {
      showToast(`Resize failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
