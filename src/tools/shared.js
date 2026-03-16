import { setState } from '../utils/state.js';

export function showProcessing(text = 'Processing…') {
  console.log(`[Processing] Start: ${text}`);
  setState({ processing: true });
  document.getElementById('processing-overlay').classList.remove('hidden');
  document.getElementById('processing-text').textContent = text;
}

export function hideProcessing() {
  console.log('[Processing] Done');
  setState({ processing: false });
  document.getElementById('processing-overlay').classList.add('hidden');
}
