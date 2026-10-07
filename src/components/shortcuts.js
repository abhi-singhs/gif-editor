import { getState } from '../utils/state.js';
import { getTools, selectToolByIndex, selectTool } from './toolbar.js';
import { handleUndo, handleRedo } from './history.js';
import { handleDownload } from './export-panel.js';
import * as player from './player.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

function shortcutList() {
  return [
    ['Open a tool', ['1', '–', String(getTools().length)]],
    ['Close the tool', ['Esc']],
    ['Play / pause', ['Space']],
    ['Previous / next frame', [',', '.']],
    ['Zoom in / out', ['+', '−']],
    ['Fit / actual size', ['0']],
    ['Compare with original', ['\\']],
    ['Undo', [MOD, 'Z']],
    ['Redo', [MOD, '⇧', 'Z']],
    ['Download', [MOD, 'S']],
    ['Paste a GIF', [MOD, 'V']],
    ['Show shortcuts', ['?']],
  ];
}

export function openShortcuts() {
  const list = document.getElementById('shortcuts-list');
  list.innerHTML = shortcutList().map(([label, keys]) => `
    <dt class="text-ink-2 font-semibold">${label}</dt>
    <dd class="flex items-center gap-1 justify-end">${keys.map((k) => (k === '–' ? '<span class="text-muted">–</span>' : `<kbd class="kbd">${k}</kbd>`)).join('')}</dd>
  `).join('');
  document.getElementById('shortcuts-dialog').showModal();
}

function isTyping(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function initShortcuts() {
  document.getElementById('shortcuts-btn').addEventListener('click', openShortcuts);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const { view } = getState();
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;

    if (key === '?' && !isTyping(e.target)) {
      e.preventDefault();
      openShortcuts();
      return;
    }
    if (view !== 'editor') return;

    // Modifier shortcuts work everywhere except inside text fields (where ⌘Z is native undo)
    if (mod && !e.altKey) {
      const k = key.toLowerCase();
      if (k === 'z' && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (k === 'y' && !isMac && !isTyping(e.target)) {
        e.preventDefault();
        handleRedo();
      } else if (k === 's') {
        e.preventDefault();
        handleDownload();
      }
      return;
    }

    if (e.altKey || isTyping(e.target)) return;
    // Let focused buttons/sliders keep Space/Enter/arrows
    const onControl = e.target instanceof HTMLElement && e.target.closest('button, [role="button"], a');

    if (/^[1-9]$/.test(key)) {
      selectToolByIndex(Number(key) - 1);
    } else if (key === 'Escape') {
      if (getState().activeTool) selectTool(null);
    } else if (key === ' ' && !onControl) {
      e.preventDefault();
      player.togglePlay();
    } else if (key === ',') {
      player.step(-1);
    } else if (key === '.') {
      player.step(1);
    } else if (key === '+' || key === '=') {
      player.zoomIn();
    } else if (key === '-' || key === '_') {
      player.zoomOut();
    } else if (key === '0') {
      player.toggleZoom();
    } else if (key === '\\') {
      player.toggleCompare();
    }
  });
}
