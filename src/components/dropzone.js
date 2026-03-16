import { getState, setState, setPreviewFromGif } from '../utils/state.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { readFileAsArrayBuffer } from '../utils/file-utils.js';
import { showToast } from './toast.js';

export function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.querySelector('div').classList.add('border-indigo-400', 'bg-indigo-950/20');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.querySelector('div').classList.remove('border-indigo-400', 'bg-indigo-950/20');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.querySelector('div').classList.remove('border-indigo-400', 'bg-indigo-950/20');
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file) {
  console.log(`[Dropzone] File received: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)} KB)`);
  if (file.type !== 'image/gif') {
    console.warn('[Dropzone] Rejected: not a GIF');
    showToast('Please select a GIF file.', 'error');
    return;
  }

  const data = await readFileAsArrayBuffer(file);
  const meta = parseGifInfo(data);
  console.log('[Dropzone] GIF parsed:', meta);

  setState({
    originalGif: data,
    currentGif: data,
    meta,
    operations: [],
    checkpoints: new Map(),
  });

  setPreviewFromGif(data);

  // Show editor UI
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('preview-area').classList.remove('hidden');
  document.getElementById('sidebar').classList.remove('hidden');

  showToast(`Loaded: ${meta.width}×${meta.height}, ${meta.frames} frames`, 'success');
}
