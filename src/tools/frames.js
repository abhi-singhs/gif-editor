import { getState, pushOperation, setState, setPreviewFromGif } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { showToast } from '../components/toast.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';
import { extractFrames, renderFrameStrip } from '../components/frame-strip.js';

registerToolRenderer('frames', renderFrames);

let currentFrames = [];

function renderFrames(panel) {
  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Frame Editing</h3>
    <div class="space-y-3">
      <p class="text-sm t-text-secondary">Extract frames, delete or reorder them, then reassemble.</p>
      <button id="frames-extract" class="w-full px-4 py-2 t-bg-secondary t-bg-hover rounded-lg text-sm font-medium transition-colors">
        Extract Frames
      </button>
      <div>
        <label for="frames-fps" class="text-xs t-text-secondary block mb-1">Output FPS</label>
        <input id="frames-fps" type="number" min="1" max="50" value="10"
          class="w-full px-3 py-1.5 t-input rounded-lg text-sm" />
      </div>
      <button id="frames-assemble" class="hidden w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Reassemble GIF
      </button>
      <p id="frames-count" class="text-xs t-text-muted"></p>
    </div>
  `;

  document.getElementById('frame-strip').classList.remove('hidden');

  document.getElementById('frames-extract').addEventListener('click', async () => {
    showProcessing('Extracting frames…');
    try {
      const { currentGif } = getState();
      currentFrames = await extractFrames(currentGif);
      renderFrameStrip(currentFrames, deleteFrame, reorderFrame);
      document.getElementById('frames-count').textContent = `${currentFrames.length} frames`;
      document.getElementById('frames-assemble').classList.remove('hidden');
    } catch (err) {
      showToast(`Frame extraction failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });

  document.getElementById('frames-assemble').addEventListener('click', reassemble);
}

function deleteFrame(idx) {
  // Revoke the URL of the deleted frame
  URL.revokeObjectURL(currentFrames[idx].url);
  currentFrames.splice(idx, 1);
  renderFrameStrip(currentFrames, deleteFrame, reorderFrame);
  document.getElementById('frames-count').textContent = `${currentFrames.length} frames`;
}

function reorderFrame(fromIdx, toIdx) {
  const [item] = currentFrames.splice(fromIdx, 1);
  currentFrames.splice(toIdx, 0, item);
  renderFrameStrip(currentFrames, deleteFrame, reorderFrame);
}

async function reassemble() {
  if (currentFrames.length === 0) { showToast('No frames to assemble', 'error'); return; }

  const fps = parseInt(document.getElementById('frames-fps')?.value) || 10;

  showProcessing('Reassembling GIF…');
  try {
    await initFFmpeg();

    // Write each frame
    for (let i = 0; i < currentFrames.length; i++) {
      const name = `frame_${String(i + 1).padStart(4, '0')}.png`;
      const buf = new Uint8Array(await currentFrames[i].blob.arrayBuffer());
      await writeFile(name, buf);
    }

    await runFFmpeg([
      '-framerate', String(fps),
      '-i', 'frame_%04d.png',
      '-y', 'output.gif',
    ]);

    const result = await readFile('output.gif');

    // Cleanup
    for (let i = 0; i < currentFrames.length; i++) {
      await deleteFile(`frame_${String(i + 1).padStart(4, '0')}.png`);
    }
    await deleteFile('output.gif');

    const newMeta = parseGifInfo(result);
    setState({ meta: newMeta });
    pushOperation('frames', { frameCount: currentFrames.length, fps }, result);
    showToast(`Assembled ${currentFrames.length} frames at ${fps} FPS`, 'success');
  } catch (err) {
    showToast(`Assembly failed: ${err.message}`, 'error');
  } finally {
    hideProcessing();
  }
}
