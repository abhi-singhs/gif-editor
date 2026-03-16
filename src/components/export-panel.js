import { getState, setState, setPreviewFromGif } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { showToast } from './toast.js';
import { downloadBlob, formatSize } from '../utils/file-utils.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { slackEmojiExport } from '../tools/slack-emoji.js';

export function initExportPanel() {
  document.getElementById('export-download').addEventListener('click', handleDownload);
  document.getElementById('export-slack').addEventListener('click', handleSlackExport);
}

function handleDownload() {
  const { currentGif } = getState();
  if (!currentGif) return;
  downloadBlob(currentGif, 'edited.gif');
  showToast('GIF downloaded!', 'success');
}

async function handleSlackExport() {
  const { currentGif } = getState();
  if (!currentGif) return;

  setState({ processing: true });
  document.getElementById('processing-overlay').classList.remove('hidden');
  document.getElementById('processing-text').textContent = 'Optimizing for Slack emoji…';

  try {
    const result = await slackEmojiExport(currentGif);
    const meta = parseGifInfo(result);

    setState({ currentGif: result, meta, processing: false });
    setPreviewFromGif(result);

    document.getElementById('processing-overlay').classList.add('hidden');

    const size = formatSize(result.byteLength);
    if (result.byteLength <= 128 * 1024) {
      downloadBlob(result, 'slack-emoji.gif');
      showToast(`Slack emoji ready! ${meta.width}×${meta.height}, ${size}`, 'success');
    } else {
      showToast(`Best achievable: ${size} (target: 128 KB). Downloaded anyway.`, 'error');
      downloadBlob(result, 'slack-emoji.gif');
    }
  } catch (err) {
    setState({ processing: false });
    document.getElementById('processing-overlay').classList.add('hidden');
    showToast(`Slack export failed: ${err?.message || err}`, 'error');
  }
}
