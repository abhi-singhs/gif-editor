import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { compressCmds } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('compress', renderCompress);

function renderCompress(panel) {
  const { meta } = getState();

  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Compress</h3>
    <div class="space-y-3">
      <div>
        <label for="compress-colors" class="text-xs t-text-secondary block mb-1">Colors: <span id="colors-val">256</span></label>
        <input id="compress-colors" type="range" min="8" max="256" step="8" value="256"
          class="w-full accent-indigo-500" />
      </div>
      <div>
        <label for="compress-fps" class="text-xs t-text-secondary block mb-1">FPS: <span id="fps-val">original</span></label>
        <input id="compress-fps" type="range" min="1" max="30" value="0"
          class="w-full accent-indigo-500" />
        <p class="text-xs t-text-muted mt-0.5">Set to 0 to keep original FPS</p>
      </div>
      <div class="text-xs t-text-secondary">
        Current size: <span class="t-text">${formatSize(meta.size)}</span>
      </div>
      <button id="compress-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Compression
      </button>
    </div>
  `;

  const colorsInput = document.getElementById('compress-colors');
  const fpsInput = document.getElementById('compress-fps');
  colorsInput.addEventListener('input', () => {
    document.getElementById('colors-val').textContent = colorsInput.value;
  });
  fpsInput.addEventListener('input', () => {
    document.getElementById('fps-val').textContent = fpsInput.value === '0' ? 'original' : fpsInput.value;
  });

  document.getElementById('compress-apply').addEventListener('click', async () => {
    const colors = parseInt(colorsInput.value);
    const fps = parseInt(fpsInput.value) || null;

    showProcessing('Compressing…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      const [pass1, pass2] = compressCmds('input.gif', 'output.gif', { colors, fps });
      await runFFmpeg(pass1);
      await runFFmpeg(pass2);
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');
      await deleteFile('palette.png');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('compress', { colors, fps }, result);

      const pct = ((1 - result.byteLength / currentGif.byteLength) * 100).toFixed(0);
      showToast(`Compressed: ${formatSize(result.byteLength)} (${pct}% smaller)`, 'success');
    } catch (err) {
      showToast(`Compression failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
