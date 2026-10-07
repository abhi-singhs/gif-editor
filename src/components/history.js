import { getState, subscribe, undo, redo, jumpTo, canUndo, canRedo } from '../utils/state.js';
import { formatSize } from '../utils/file-utils.js';
import { escapeHtml } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { showToast } from './toast.js';

export function initHistory() {
  document.getElementById('undo-btn').addEventListener('click', handleUndo);
  document.getElementById('redo-btn').addEventListener('click', handleRedo);
  document.getElementById('history-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-entry]');
    if (item && !getState().processing) jumpTo(Number(item.dataset.entry));
  });
  subscribe('history', render);
  subscribe('processing', render);
}

export function handleUndo() {
  if (getState().processing) return;
  const label = undo();
  showToast(label ? `Undid “${label}”` : 'Nothing to undo', 'info', 2000, 'history');
}

export function handleRedo() {
  if (getState().processing) return;
  const label = redo();
  showToast(label ? `Redid “${label}”` : 'Nothing to redo', 'info', 2000, 'history');
}

function render() {
  const { history, processing } = getState();
  document.getElementById('undo-btn').disabled = processing || !canUndo();
  document.getElementById('redo-btn').disabled = processing || !canRedo();

  const edits = history.entries.length - 1;
  document.getElementById('history-count').textContent = edits > 0 ? `${edits} edit${edits === 1 ? '' : 's'}` : '';

  document.getElementById('history-list').innerHTML = history.entries.map((entry, i) => {
    const current = i === history.index;
    const future = i > history.index;
    return `
      <li>
        <button type="button" data-entry="${i}" ${current ? 'aria-current="step"' : ''}
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-sm transition-colors
            ${current ? 'bg-accent-soft font-extrabold' : 'hover:bg-surface-2 font-semibold'} ${future ? 'opacity-50' : ''}">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0
            ${current ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}">${i === 0 ? '★' : i}</span>
          <span class="flex-1 truncate">${escapeHtml(entry.label)}</span>
          <span class="text-xs text-muted tabular-nums">${formatSize(entry.gif.byteLength)}</span>
        </button>
      </li>`;
  }).join('');
}

/** Panel content when no tool is selected: a friendly nudge plus quick tips */
export function renderIdlePanel(panel) {
  const { meta } = getState();
  const isSquare = meta.width === meta.height;
  panel.innerHTML = `
    <div class="text-center py-4">
      <div class="text-4xl mb-2" aria-hidden="true">👈</div>
      <h2 class="text-lg font-extrabold">Pick a tool to start</h2>
      <p class="text-sm text-muted mb-4">Or press <kbd class="kbd">1</kbd>–<kbd class="kbd">8</kbd> to jump straight to one.</p>
    </div>
    <ul class="space-y-2 text-sm">
      <li class="flex gap-2.5 items-start p-3 rounded-2xl bg-surface-2">
        ${icon('slack', 'w-4 h-4 mt-0.5 text-slack')}
        <span><strong>Slack emoji</strong> crops to a square and squeezes the GIF under 128 KB.
        ${meta.size <= 128 * 1024 && isSquare ? 'This one already fits! 🎉' : ''}</span>
      </li>
      <li class="flex gap-2.5 items-start p-3 rounded-2xl bg-surface-2">
        ${icon('compare', 'w-4 h-4 mt-0.5 text-accent')}
        <span><strong>Compare</strong> shows your edit next to the original. Press <kbd class="kbd">\\</kbd> to toggle.</span>
      </li>
      <li class="flex gap-2.5 items-start p-3 rounded-2xl bg-surface-2">
        ${icon('history', 'w-4 h-4 mt-0.5 text-accent')}
        <span>Every edit is saved in <strong>History</strong>. Click any step to jump back to it.</span>
      </li>
    </ul>`;
}
