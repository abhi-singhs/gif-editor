import { writeFile, readFile, runFFmpeg, deleteFile } from '../ffmpeg/engine.js';
import { extractFramesCmd } from '../ffmpeg/commands.js';
import { icon } from '../ui/icons.js';

/**
 * Extract individual frames from a GIF as PNG blobs.
 * Returns array of { index, blob, url }.
 */
export async function extractFrames(gifData) {
  await writeFile('input.gif', gifData);
  await runFFmpeg(extractFramesCmd('input.gif', 'frame_%04d.png'));

  const frames = [];
  for (let i = 1; ; i++) {
    const name = `frame_${String(i).padStart(4, '0')}.png`;
    try {
      const data = await readFile(name);
      const blob = new Blob([data], { type: 'image/png' });
      frames.push({ index: i, blob, url: URL.createObjectURL(blob) });
      await deleteFile(name);
    } catch {
      break;
    }
  }
  await deleteFile('input.gif');
  return frames;
}

/**
 * Render the frame strip.
 * - click selects, ⌘/Ctrl-click toggles, Shift-click selects a range
 * - drag to reorder; Alt+←/→ moves the focused frame; Delete removes the selection
 * @param {{frames: Array, selected: Set<number>, focus: number, autoFocus?: boolean, onDelete: (idxs: number[]) => void, onMove: (from: number, to: number) => void, onSelect: (idx: number, keyboard?: boolean) => void}} opts
 */
export function renderFrameStrip({ frames, selected, focus, autoFocus = false, onDelete, onMove, onSelect }) {
  const container = document.getElementById('frame-strip-inner');
  container.innerHTML = '';

  frames.forEach((frame, idx) => {
    const isSelected = selected.has(idx);
    const item = document.createElement('div');
    item.className = `group relative shrink-0 rounded-xl p-0.5 cursor-grab transition-shadow ${isSelected ? 'ring-[3px] ring-accent' : 'ring-1 ring-line hover:ring-2 hover:ring-muted'}`;
    item.draggable = true;
    item.tabIndex = idx === focus ? 0 : -1;
    item.dataset.idx = idx;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(isSelected));
    item.setAttribute('aria-label', `Frame ${idx + 1} of ${frames.length}`);
    item.innerHTML = `
      <img src="${frame.url}" alt="" draggable="false" class="w-20 h-20 object-contain rounded-[10px] checker" />
      <span class="absolute bottom-1 left-1 px-1.5 rounded-md text-[10px] font-black ${isSelected ? 'bg-accent text-on-accent' : 'bg-surface/90 text-ink-2'}">${idx + 1}</span>
      <button type="button" tabindex="-1" class="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-danger text-surface shadow flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" aria-label="Delete frame ${idx + 1}">${icon('x', 'w-3.5 h-3.5')}</button>`;

    item.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete([idx]);
    });

    item.addEventListener('click', (e) => {
      if (e.shiftKey && selected.size) {
        const anchor = Math.min(...selected);
        const [a, b] = anchor < idx ? [anchor, idx] : [idx, anchor];
        for (let i = a; i <= b; i++) selected.add(i);
      } else if (e.metaKey || e.ctrlKey) {
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
      } else {
        const only = selected.size === 1 && selected.has(idx);
        selected.clear();
        if (!only) selected.add(idx);
      }
      onSelect(idx);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const to = idx + (e.key === 'ArrowLeft' ? -1 : 1);
        if (to < 0 || to >= frames.length) return;
        if (e.altKey) onMove(idx, to);
        else onSelect(to, true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(selected.size ? [...selected] : [idx]);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
        onSelect(idx, true);
      }
    });

    // Drag-and-drop reorder
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-frame-index', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('opacity-40');
    });
    item.addEventListener('dragend', () => item.classList.remove('opacity-40'));
    item.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-frame-index')) e.preventDefault();
    });
    item.addEventListener('drop', (e) => {
      const from = parseInt(e.dataTransfer.getData('application/x-frame-index'), 10);
      if (Number.isNaN(from)) return;
      e.preventDefault();
      e.stopPropagation();
      if (from !== idx) onMove(from, idx);
    });

    container.appendChild(item);
  });

  const focused = container.querySelector(`[data-idx="${focus}"]`);
  if (autoFocus) focused?.focus();
  focused?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
