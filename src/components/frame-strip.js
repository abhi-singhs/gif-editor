import { getState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { extractFramesCmd, assembleFramesCmd } from '../ffmpeg/commands.js';

/**
 * Extract individual frames from a GIF as PNG blobs.
 * Returns array of { index, blob, url }.
 */
export async function extractFrames(gifData) {
  await initFFmpeg();
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

/** Render the frame strip UI */
export function renderFrameStrip(frames, onDelete, onReorder) {
  const container = document.getElementById('frame-strip-inner');
  container.innerHTML = '';

  frames.forEach((frame, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative shrink-0 group cursor-grab';
    wrapper.draggable = true;
    wrapper.dataset.idx = idx;

    const img = document.createElement('img');
    img.src = frame.url;
    img.className = 'w-16 h-16 object-cover rounded border t-frame-border';
    img.alt = `Frame ${idx + 1}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center';
    delBtn.textContent = '×';
    delBtn.setAttribute('aria-label', `Delete frame ${idx + 1}`);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(idx);
    });

    const label = document.createElement('span');
    label.className = 'absolute bottom-0 left-0 right-0 text-center text-[10px] t-text-secondary bg-black/50';
    label.textContent = idx + 1;

    wrapper.append(img, delBtn, label);
    container.appendChild(wrapper);

    // Drag-and-drop reorder
    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(idx));
      wrapper.classList.add('opacity-50');
    });
    wrapper.addEventListener('dragend', () => wrapper.classList.remove('opacity-50'));
    wrapper.addEventListener('dragover', (e) => e.preventDefault());
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(fromIdx) && fromIdx !== idx) {
        onReorder(fromIdx, idx);
      }
    });
  });
}
