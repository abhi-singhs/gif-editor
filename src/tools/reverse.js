import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { reverseCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('reverse', renderReverse);

function renderReverse(panel) {
  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Reverse</h3>
    <div class="space-y-3">
      <p class="text-sm t-text-secondary">Reverse the playback order of all frames.</p>
      <button id="reverse-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Reverse GIF
      </button>
    </div>
  `;

  document.getElementById('reverse-apply').addEventListener('click', async () => {
    showProcessing('Reversing…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(reverseCmd('input.gif', 'output.gif'));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('reverse', {}, result);
      showToast('GIF reversed!', 'success');
    } catch (err) {
      showToast(`Reverse failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
