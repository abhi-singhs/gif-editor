import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { speedCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('speed', renderSpeed);

function renderSpeed(panel) {
  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Speed</h3>
    <div class="space-y-3">
      <div>
        <label for="speed-slider" class="text-xs t-text-secondary block mb-1">Speed: <span id="speed-val">1.0</span>x</label>
        <input id="speed-slider" type="range" min="0.25" max="4" step="0.25" value="1"
          class="w-full accent-indigo-500" />
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="speed-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-speed="0.5">0.5×</button>
        <button class="speed-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-speed="1">1×</button>
        <button class="speed-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-speed="1.5">1.5×</button>
        <button class="speed-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-speed="2">2×</button>
        <button class="speed-preset px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded" data-speed="4">4×</button>
      </div>
      <button id="speed-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Speed
      </button>
    </div>
  `;

  const slider = document.getElementById('speed-slider');
  slider.addEventListener('input', () => {
    document.getElementById('speed-val').textContent = parseFloat(slider.value).toFixed(2);
  });

  for (const btn of document.querySelectorAll('.speed-preset')) {
    btn.addEventListener('click', () => {
      slider.value = btn.dataset.speed;
      document.getElementById('speed-val').textContent = parseFloat(btn.dataset.speed).toFixed(2);
    });
  }

  document.getElementById('speed-apply').addEventListener('click', async () => {
    const speed = parseFloat(slider.value);
    if (speed === 1) { showToast('Speed is already 1×', 'info'); return; }

    showProcessing('Adjusting speed…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(speedCmd('input.gif', 'output.gif', speed));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('speed', { speed }, result);
      showToast(`Speed set to ${speed}×`, 'success');
    } catch (err) {
      showToast(`Speed change failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
