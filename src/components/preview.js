import { subscribe, getState } from '../utils/state.js';
import { formatSize } from '../utils/file-utils.js';

export function initPreview() {
  const img = document.getElementById('preview-img');

  subscribe('previewUrl', (url) => {
    if (url) img.src = url;
  });

  subscribe('meta', (meta) => {
    if (!meta) return;
    document.getElementById('meta-dimensions').textContent = `${meta.width} × ${meta.height}`;
    document.getElementById('meta-frames').textContent = `${meta.frames} frames`;
    document.getElementById('meta-duration').textContent = `${(meta.duration / 1000).toFixed(1)}s`;
    const fps = meta.duration > 0 ? (meta.frames / (meta.duration / 1000)).toFixed(1) : '0';
    document.getElementById('meta-fps').textContent = `${fps} fps`;
    document.getElementById('meta-size').textContent = formatSize(meta.size);
  });
}
