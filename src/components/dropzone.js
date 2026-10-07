import { getState, loadGif } from '../utils/state.js';
import { readFileAsArrayBuffer } from '../utils/file-utils.js';
import { initFFmpeg } from '../ffmpeg/engine.js';
import { confirmDialog } from '../ui/dialog.js';
import { showView } from '../ui/views.js';
import { showToast } from './toast.js';
import { filterGifs, openBatch, addToBatch } from './batch.js';
import { closeTool } from './toolbar.js';

/** File intake: landing drop target, full-window drag-and-drop, and paste */
export function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  const browse = (multiple) => {
    fileInput.multiple = multiple;
    fileInput.click();
  };
  dropzone.addEventListener('click', () => browse(true));
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      browse(true);
    }
  });
  document.getElementById('landing-edit').addEventListener('click', () => browse(false));
  document.getElementById('landing-batch').addEventListener('click', () => browse(true));

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  initWindowDrop();

  window.addEventListener('paste', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const files = e.clipboardData?.files;
    if (files?.length) {
      e.preventDefault();
      handleFiles(files);
    }
  });
}

/** Dropping files anywhere in the window shows an overlay and loads them */
function initWindowDrop() {
  const overlay = document.getElementById('drop-overlay');
  let depth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || getState().processing) return;
    e.preventDefault();
    if (depth++ === 0) {
      document.getElementById('drop-overlay-hint').textContent = getState().view === 'batch'
        ? 'Drop GIFs to add them to the batch'
        : 'Drop one GIF to edit it, or several for Slack emoji';
      overlay.classList.remove('hidden');
    }
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) {
      depth = 0;
      overlay.classList.add('hidden');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.classList.add('hidden');
    if (!getState().processing) handleFiles(e.dataTransfer.files);
  });
}

/** One GIF opens the editor; several go to the batch Slack export view */
export async function handleFiles(fileList) {
  const gifs = filterGifs(fileList);
  if (gifs.length === 0) return;

  const { view, history } = getState();
  if (view === 'batch') {
    addToBatch(gifs);
    return;
  }
  if (view === 'editor' && history.entries.length > 1) {
    const ok = await confirmDialog({
      title: 'Replace this GIF?',
      body: `You'll lose your ${history.entries.length - 1} edit(s). Download first if you want to keep them.`,
      confirmLabel: 'Replace',
    });
    if (!ok) return;
  }

  if (gifs.length === 1) openEditor(gifs[0]);
  else openBatch(gifs);
}

async function openEditor(file) {
  console.log(`[Dropzone] File received: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  const data = await readFileAsArrayBuffer(file);
  closeTool();
  showView('editor');
  const meta = loadGif(data, file.name);
  console.log('[Dropzone] GIF parsed:', meta);

  // Warm the engine up in the background so the first edit is quick
  initFFmpeg().catch(() => {});

  showToast(`Loaded ${file.name}: ${meta.width}×${meta.height}, ${meta.frames} frames`, 'success');
}
