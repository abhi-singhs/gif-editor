import { zipSync } from 'fflate';
import { parseGifInfo } from '../utils/gif-info.js';
import { readFileAsArrayBuffer, downloadBlob, formatSize } from '../utils/file-utils.js';
import { slackEmojiExport } from '../tools/slack-emoji.js';
import { showProcessing, hideProcessing } from '../tools/shared.js';
import { showToast } from './toast.js';

const SLACK_MAX_SIZE = 128 * 1024; // 128 KB

/** @type {Array<{id: number, name: string, data: Uint8Array, meta: object, previewUrl: string, result: Uint8Array|null, status: 'pending'|'ok'|'over'|'failed'}>} */
let items = [];
let nextId = 1;

export function initBatch() {
  const area = document.getElementById('batch-area');
  const input = document.getElementById('batch-file-input');

  document.getElementById('batch-add-btn').addEventListener('click', () => input.click());
  document.getElementById('batch-clear-btn').addEventListener('click', clearBatch);
  document.getElementById('batch-export-btn').addEventListener('click', exportAll);

  input.addEventListener('change', (e) => {
    addFiles(filterGifs(e.target.files));
    input.value = '';
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('bg-indigo-950/20');
  });

  area.addEventListener('dragleave', () => {
    area.classList.remove('bg-indigo-950/20');
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('bg-indigo-950/20');
    addFiles(filterGifs(e.dataTransfer.files));
  });

  document.getElementById('batch-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) removeItem(Number(btn.dataset.remove));
  });
}

/** Keep only GIFs from a FileList, toasting about anything rejected */
export function filterGifs(fileList) {
  const files = Array.from(fileList || []);
  const gifs = files.filter((f) => f.type === 'image/gif');
  const rejected = files.length - gifs.length;
  if (rejected > 0) {
    console.warn(`[Batch] Rejected ${rejected} non-GIF file(s)`);
    showToast(`Skipped ${rejected} non-GIF file${rejected === 1 ? '' : 's'}`, 'error');
  }
  return gifs;
}

export async function openBatch(files) {
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('batch-area').classList.remove('hidden');
  await addFiles(files);
}

async function addFiles(files) {
  if (files.length === 0) return;
  console.log(`[Batch] Adding ${files.length} GIF(s)`);

  for (const file of files) {
    const data = await readFileAsArrayBuffer(file);
    items.push({
      id: nextId++,
      name: uniqueName(file.name),
      data,
      meta: parseGifInfo(data),
      previewUrl: URL.createObjectURL(new Blob([data], { type: 'image/gif' })),
      result: null,
      status: 'pending',
    });
  }

  render();
  showToast(`Added ${files.length} GIF${files.length === 1 ? '' : 's'}`, 'success');
}

/** Avoid collisions inside the zip: "cat.gif", "cat-2.gif", "cat-3.gif"… */
function uniqueName(name) {
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while (taken.has(`${base}-${n}${ext}`.toLowerCase())) n++;
  return `${base}-${n}${ext}`;
}

function removeItem(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  URL.revokeObjectURL(item.previewUrl);
  items = items.filter((i) => i.id !== id);
  if (items.length === 0) {
    clearBatch();
  } else {
    render();
  }
}

function clearBatch() {
  for (const item of items) URL.revokeObjectURL(item.previewUrl);
  items = [];
  document.getElementById('batch-area').classList.add('hidden');
  document.getElementById('dropzone').classList.remove('hidden');
  console.log('[Batch] Cleared, back to dropzone');
}

function statusLabel(item) {
  if (!item.result) {
    return item.status === 'failed' ? '<span class="t-status-error">✕ Failed</span>' : '';
  }
  const size = formatSize(item.result.byteLength);
  return item.status === 'ok'
    ? `<span class="t-status-ok">✓ ${size}</span>`
    : `<span class="t-status-warn">⚠ ${size} (over 128 KB)</span>`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  document.getElementById('batch-count').textContent = `${items.length} GIF${items.length === 1 ? '' : 's'}`;

  const grid = document.getElementById('batch-grid');
  grid.innerHTML = items.map((item) => `
    <div class="t-bg-secondary rounded-lg p-2 flex flex-col gap-1.5 relative">
      <button data-remove="${item.id}" class="absolute top-1 right-1 w-6 h-6 rounded-full t-bg t-bg-hover text-xs transition-colors" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
      <div class="aspect-square flex items-center justify-center overflow-hidden rounded">
        <img src="${item.previewUrl}" alt="" class="max-w-full max-h-full object-contain" />
      </div>
      <p class="text-xs font-medium truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
      <p class="text-xs t-text-muted">${item.meta.width}×${item.meta.height} · ${formatSize(item.meta.size)}</p>
      <p class="text-xs min-h-4">${statusLabel(item)}</p>
    </div>
  `).join('');
}

async function exportAll() {
  if (items.length === 0) return;
  console.log(`[Batch] Exporting ${items.length} GIF(s) for Slack`);

  const files = {};
  let over = 0;
  let failed = 0;

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      showProcessing(`Optimizing ${i + 1}/${items.length}: ${item.name}…`);
      try {
        item.result = await slackEmojiExport(item.data);
        item.status = item.result.byteLength <= SLACK_MAX_SIZE ? 'ok' : 'over';
        if (item.status === 'over') over++;
        files[item.name] = item.result;
      } catch (err) {
        console.error(`[Batch] Failed to export ${item.name}:`, err);
        item.result = null;
        item.status = 'failed';
        failed++;
      }
      render();
    }

    const exported = Object.keys(files).length;
    if (exported === 0) {
      showToast('Slack export failed for every GIF', 'error');
      return;
    }

    // GIFs are already compressed, so store without deflate
    const zip = zipSync(files, { level: 0 });
    downloadBlob(zip, 'slack-emojis.zip', 'application/zip');

    const parts = [`Exported ${exported} GIF${exported === 1 ? '' : 's'}`];
    if (over) parts.push(`${over} over 128 KB`);
    if (failed) parts.push(`${failed} failed`);
    showToast(parts.join(' · '), over || failed ? 'error' : 'success', 5000);
  } finally {
    hideProcessing();
  }
}
