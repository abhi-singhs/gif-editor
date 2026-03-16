import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { trimCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('trim', renderTrim);

function renderTrim(panel) {
  const { meta } = getState();
  const totalSec = (meta.duration / 1000).toFixed(2);

  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Trim</h3>
    <div class="space-y-3">
      <div>
        <label for="trim-start" class="text-xs t-text-secondary block mb-1">Start time (s)</label>
        <input id="trim-start" type="number" min="0" max="${totalSec}" step="0.01" value="0"
          class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
      </div>
      <div>
        <label for="trim-end" class="text-xs t-text-secondary block mb-1">End time (s)</label>
        <input id="trim-end" type="number" min="0" max="${totalSec}" step="0.01" value="${totalSec}"
          class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
      </div>
      <div class="text-xs t-text-secondary">
        Total duration: <span class="t-text">${totalSec}s</span>
      </div>
      <button id="trim-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Trim
      </button>
    </div>
  `;

  document.getElementById('trim-apply').addEventListener('click', async () => {
    const start = parseFloat(document.getElementById('trim-start').value) || 0;
    const end = parseFloat(document.getElementById('trim-end').value) || parseFloat(totalSec);
    const duration = end - start;

    if (duration <= 0) { showToast('End must be after start', 'error'); return; }

    showProcessing('Trimming…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(trimCmd('input.gif', 'output.gif', start, duration));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('trim', { start, duration }, result);
      showToast(`Trimmed to ${duration.toFixed(2)}s (${formatSize(result.byteLength)})`, 'success');
    } catch (err) {
      showToast(`Trim failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
