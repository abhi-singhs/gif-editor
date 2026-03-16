import './styles/custom.css';

// Components
import { initDropzone } from './components/dropzone.js';
import { initPreview } from './components/preview.js';
import { initToolbar } from './components/toolbar.js';
import { initExportPanel } from './components/export-panel.js';

// Tools (self-registering via registerToolRenderer)
import './tools/resize.js';
import './tools/crop.js';
import './tools/compress.js';
import './tools/speed.js';
import './tools/trim.js';
import './tools/reverse.js';
import './tools/frames.js';
import './tools/filters.js';

// State
import { getState, popOperation, setState, setPreviewFromGif, subscribe, resetState } from './utils/state.js';
import { parseGifInfo } from './utils/gif-info.js';
import { initFFmpeg } from './ffmpeg/engine.js';
import { showToast } from './components/toast.js';
import { showProcessing, hideProcessing } from './tools/shared.js';

// Undo support: replay operations from original
import { writeFile, readFile, runFFmpeg, deleteFile } from './ffmpeg/engine.js';
import * as commands from './ffmpeg/commands.js';

// Theme toggle
function initThemeToggle() {
  const saved = localStorage.getItem('gif-editor-theme');
  if (saved === 'light') document.documentElement.classList.add('light');

  const btn = document.getElementById('theme-toggle');
  updateThemeIcon(btn);

  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    localStorage.setItem('gif-editor-theme', isLight ? 'light' : 'dark');
    updateThemeIcon(btn);
    console.log(`[App] Theme set to ${isLight ? 'light' : 'dark'}`);
  });
}

function updateThemeIcon(btn) {
  const isLight = document.documentElement.classList.contains('light');
  btn.innerHTML = `<span aria-hidden="true">${isLight ? '☀️' : '🌙'}</span>`;
  btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
}

// Browser check
function checkBrowser() {
  const ua = navigator.userAgent;
  const isChromium = /Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !/Safari/i.test(ua.replace(/Chrome|Chromium|Edg|OPR|Brave/gi, ''));
  const isFirefox = /Firefox/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edg/i.test(ua);
  const isEdge = /Edg/i.test(ua);

  if (isChrome || isEdge || isChromium || isFirefox) return true;

  // Fallback: check for Chrome or Firefox-like features
  if (/Chrome\/\d/i.test(ua) || /Firefox\/\d/i.test(ua)) return true;

  return false;
}

// Revert to original handler
function handleRevert() {
  const { originalGif } = getState();
  if (!originalGif) return;

  const meta = parseGifInfo(originalGif);
  setState({ currentGif: originalGif, meta, operations: [], checkpoints: new Map() });
  setPreviewFromGif(originalGif);
  updateUndoButton();
  showToast('Reverted to original', 'success');
  console.log('[App] Reverted to original');
}

// Remove GIF and go back to dropzone
function handleNewGif() {
  resetState();
  document.getElementById('preview-area').classList.add('hidden');
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('frame-strip').classList.add('hidden');
  document.getElementById('dropzone').classList.remove('hidden');
  updateUndoButton();
  setState({ activeTool: null });
  showToast('Ready for a new GIF', 'info');
  console.log('[App] Removed GIF, back to dropzone');
}

// Undo handler
async function handleUndo() {
  console.log('[Undo] Undo requested, operations:', getState().operations.length);
  const ops = popOperation();
  if (!ops) { showToast('Nothing to undo', 'info'); return; }

  if (ops.length === 0) {
    // Revert to original
    const { originalGif } = getState();
    const meta = parseGifInfo(originalGif);
    setState({ currentGif: originalGif, meta });
    setPreviewFromGif(originalGif);
    updateUndoButton();
    showToast('Reverted to original', 'success');
    return;
  }

  // Check for a checkpoint close to the target
  const { checkpoints, originalGif } = getState();
  let startIdx = 0;
  let startGif = originalGif;

  for (const [cpIdx, cpData] of checkpoints) {
    if (cpIdx < ops.length && cpIdx >= startIdx) {
      startIdx = cpIdx + 1;
      startGif = cpData;
    }
  }

  showProcessing('Undoing…');
  try {
    let current = startGif;
    // Replay operations from startIdx to ops.length - 1
    for (let i = startIdx; i < ops.length; i++) {
      current = await replayOperation(current, ops[i]);
    }

    const meta = parseGifInfo(current);
    setState({ currentGif: current, meta });
    setPreviewFromGif(current);
    updateUndoButton();
    showToast('Undone!', 'success');
  } catch (err) {
    showToast(`Undo failed: ${err.message}`, 'error');
  } finally {
    hideProcessing();
  }
}

async function replayOperation(gifData, op) {
  console.log(`[Undo] Replaying operation: ${op.tool}`, op.params);
  await initFFmpeg();
  await writeFile('input.gif', gifData);

  // Two-pass operations (compress)
  if (op.tool === 'compress') {
    const [pass1, pass2] = commands.compressCmds('input.gif', 'output.gif', op.params);
    await runFFmpeg(pass1);
    await runFFmpeg(pass2);
    const result = await readFile('output.gif');
    await deleteFile('input.gif');
    await deleteFile('output.gif');
    await deleteFile('palette.png');
    return result;
  }

  let cmd;
  switch (op.tool) {
    case 'resize':
      cmd = commands.resizeCmd('input.gif', 'output.gif', op.params.w, op.params.h);
      break;
    case 'crop':
      cmd = commands.cropCmd('input.gif', 'output.gif', op.params.w, op.params.h, op.params.x, op.params.y);
      break;
    case 'speed':
      cmd = commands.speedCmd('input.gif', 'output.gif', op.params.speed);
      break;
    case 'trim':
      cmd = commands.trimCmd('input.gif', 'output.gif', op.params.start, op.params.duration);
      break;
    case 'reverse':
      cmd = commands.reverseCmd('input.gif', 'output.gif');
      break;
    case 'filters':
      cmd = commands.filterCmd('input.gif', 'output.gif', op.params);
      break;
    default:
      await deleteFile('input.gif');
      return gifData;
  }

  await runFFmpeg(cmd);
  const result = await readFile('output.gif');
  await deleteFile('input.gif');
  await deleteFile('output.gif');
  return result;
}

function updateUndoButton() {
  const { operations } = getState();
  const btn = document.getElementById('undo-btn');
  const count = document.getElementById('undo-count');
  const revertBtn = document.getElementById('revert-btn');
  if (operations.length > 0) {
    btn.classList.remove('hidden');
    revertBtn.classList.remove('hidden');
    count.textContent = `(${operations.length})`;
  } else {
    btn.classList.add('hidden');
    revertBtn.classList.add('hidden');
  }
}

function bootstrap() {
  console.log('[App] Bootstrapping GIF Editor…');
  if (!checkBrowser()) {
    console.warn('[App] Unsupported browser detected, blocking usage');
    document.getElementById('unsupported-banner').classList.remove('hidden');
    return;
  }
  console.log('[App] Browser check passed');

  initDropzone();
  initPreview();
  initToolbar();
  initExportPanel();
  initThemeToggle();
  console.log('[App] All components initialized');

  document.getElementById('undo-btn').addEventListener('click', handleUndo);
  document.getElementById('revert-btn').addEventListener('click', handleRevert);
  document.getElementById('new-gif-btn').addEventListener('click', handleNewGif);
  subscribe('operations', updateUndoButton);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
    }
  });
}

bootstrap();
