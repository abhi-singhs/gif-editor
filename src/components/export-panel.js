import { getState, commit } from '../utils/state.js';
import { showToast } from './toast.js';
import { downloadBlob, formatSize } from '../utils/file-utils.js';
import { slackEmojiExport } from '../tools/slack-emoji.js';
import { runJob } from '../tools/shared.js';

const SLACK_MAX_SIZE = 128 * 1024;

export function initExportPanel() {
  document.getElementById('export-download').addEventListener('click', handleDownload);
  document.getElementById('export-slack').addEventListener('click', handleSlackExport);
}

/** "cat.gif" → "cat-edited.gif" (or the original name when nothing was edited) */
function downloadName() {
  const { fileName, history } = getState();
  const base = (fileName || 'animation.gif').replace(/\.gif$/i, '');
  return history.index === 0 ? `${base}.gif` : `${base}-edited.gif`;
}

export function handleDownload() {
  const { currentGif, processing } = getState();
  if (!currentGif || processing) return;
  const name = downloadName();
  downloadBlob(currentGif, name);
  showToast(`Downloaded ${name}`, 'success');
}

async function handleSlackExport() {
  const { currentGif, fileName } = getState();
  if (!currentGif) return;

  const result = await runJob('Squeezing into a Slack emoji…', () => slackEmojiExport(currentGif));
  if (!result) return;

  // Keep the result in history so it can be undone or tweaked further
  commit('Slack emoji', result);
  const { meta } = getState();
  downloadBlob(result, fileName || 'slack-emoji.gif');

  const size = formatSize(result.byteLength);
  if (result.byteLength <= SLACK_MAX_SIZE) {
    showToast(`Slack emoji ready! ${meta.width}×${meta.height}, ${size}`, 'success');
  } else {
    showToast(`Best we could do is ${size} (Slack wants ≤128 KB). Downloaded anyway. Try trimming it first.`, 'error', 7000);
  }
}
