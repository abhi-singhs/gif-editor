import { setState } from '../utils/state.js';

const VIEWS = { landing: 'landing', editor: 'editor', batch: 'batch-area' };

/** Switch between the landing page, the single-GIF editor and the batch view */
export function showView(view) {
  for (const [name, id] of Object.entries(VIEWS)) {
    document.getElementById(id).classList.toggle('hidden', name !== view);
  }
  const inEditor = view === 'editor';
  for (const id of ['file-chip', 'editor-actions']) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden', !inEditor);
    el.classList.toggle('flex', inEditor);
  }
  setState({ view });
}
