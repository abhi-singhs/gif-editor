import { zipSync } from 'fflate';
import { parseGifInfo } from '../utils/gif-info.js';
import { readFileAsArrayBuffer, downloadBlob, formatSize } from '../utils/file-utils.js';
import { resetState } from '../utils/state.js';
import { slackEmojiExport } from '../tools/slack-emoji.js';
import { escapeHtml } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { showView } from '../ui/views.js';
import { showToast } from './toast.js';

const SLACK_MAX_SIZE = 128 * 1024; // 128 KB

/** @type {Array<{id: number, name: string, data: Uint8Array, meta: object, previewUrl: string, result: Uint8Array|null, resultUrl: string|null, status: 'pending'|'working'|'ok'|'over'|'failed'}>} */
let items = [];
let nextId = 1;
let exporting = false;

export function initBatch() {
  const input = document.getElementById('batch-file-input');

  document.getElementById('batch-add-btn').addEventListener('click', () => input.click());
  document.getElementById('batch-clear-btn').addEventListener('click', () => clearBatch());
  document.getElementById('batch-export-btn').addEventListener('click', exportAll);

  input.addEventListener('change', (e) => {
    addToBatch(filterGifs(e.target.files));
    input.value = '';
  });

  document.getElementById('batch-grid').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) removeItem(Number(remove.dataset.remove));
    const download = e.target.closest('[data-download]');
    if (download) downloadItem(Number(download.dataset.download));
  });
}

/** Keep only GIFs from a FileList, toasting about anything rejected */
export function filterGifs(fileList) {
  const files = Array.from(fileList || []);
  const gifs = files.filter((f) => f.type === 'image/gif');
  const rejected = files.length - gifs.length;
  if (rejected > 0) {
    console.warn(`[Batch] Rejected ${rejected} non-GIF file(s)`);
    showToast(`Skipped ${rejected} non-GIF file${rejected === 1 ? '' : 's'}. Only GIFs are supported.`, 'error');
  }
  return gifs;
}

export async function openBatch(files) {
  resetState();
  showView('batch');
  await addToBatch(files);
}

export async function addToBatch(files) {
  if (files.length === 0 || exporting) return;
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
      resultUrl: null,
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

function revoke(item) {
  URL.revokeObjectURL(item.previewUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

function removeItem(id) {
  if (exporting) return;
  const item = items.find((i) => i.id === id);
  if (!item) return;
  revoke(item);
  items = items.filter((i) => i.id !== id);
  if (items.length === 0) clearBatch();
  else render();
}

function downloadItem(id) {
  const item = items.find((i) => i.id === id);
  if (item?.result) downloadBlob(item.result, item.name);
}

/** Empty the batch and return to the landing page */
export function clearBatch() {
  if (exporting) return;
  for (const item of items) revoke(item);
  items = [];
  render();
  showView('landing');
  console.log('[Batch] Cleared, back to landing');
}

export function hasBatchItems() {
  return items.length > 0;
}

function statusPill(item) {
  const pill = (cls, content) => `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-extrabold ${cls}">${content}</span>`;
  const delta = item.result ? Math.round((item.result.byteLength / item.meta.size - 1) * 100) : 0;
  switch (item.status) {
    case 'working': return pill('bg-accent-soft text-accent', `${icon('loader', 'w-3 h-3 animate-spin')} Squeezing…`);
    case 'ok': return pill('bg-ok/15 text-ok', `${icon('check', 'w-3 h-3')} ${formatSize(item.result.byteLength)} (${delta > 0 ? '+' : ''}${delta}%)`);
    case 'over': return pill('bg-warn/15 text-warn', `${icon('warn', 'w-3 h-3')} ${formatSize(item.result.byteLength)}, over 128 KB`);
    case 'failed': return pill('bg-danger/15 text-danger', `${icon('error', 'w-3 h-3')} Failed`);
    default: return pill('bg-surface-2 text-muted', 'Ready');
  }
}

function render() {
  const done = items.filter((i) => i.result).length;
  document.getElementById('batch-count').textContent =
    `${items.length} GIF${items.length === 1 ? '' : 's'}${done ? ` · ${done} optimized` : ''}`;

  const pending = items.filter((i) => !i.result).length;
  document.getElementById('batch-export-label').textContent = exporting
    ? 'Exporting…'
    : pending === 0 && items.length > 0 ? 'Download .zip' : 'Export all (.zip)';
  for (const id of ['batch-export-btn', 'batch-add-btn', 'batch-clear-btn']) {
    document.getElementById(id).disabled = exporting || (id === 'batch-export-btn' && items.length === 0);
  }

  document.getElementById('batch-grid').innerHTML = items.map((item) => `
    <div class="card p-2 flex flex-col gap-2 relative animate-pop-in">
      <button type="button" data-remove="${item.id}" ${exporting ? 'disabled' : ''}
        class="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-surface/90 shadow flex items-center justify-center hover:bg-danger hover:text-surface transition-colors disabled:opacity-0"
        aria-label="Remove ${escapeHtml(item.name)}">${icon('x', 'w-3.5 h-3.5')}</button>
      <div class="aspect-square rounded-xl overflow-hidden checker flex items-center justify-center">
        <img src="${item.resultUrl || item.previewUrl}" alt="" class="max-w-full max-h-full object-contain ${item.status === 'working' ? 'opacity-50' : ''}" />
      </div>
      <div class="px-1 min-w-0">
        <p class="text-sm font-extrabold truncate" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
        <p class="text-xs text-muted font-semibold">${item.meta.width}×${item.meta.height} · ${formatSize(item.meta.size)}</p>
      </div>
      <div class="px-1 pb-1 flex items-center gap-1 min-h-7">
        ${statusPill(item)}
        ${item.result ? `<button type="button" data-download="${item.id}" class="ml-auto btn btn-ghost btn-icon !p-1" aria-label="Download ${escapeHtml(item.name)}" title="Download this one">${icon('download', 'w-4 h-4')}</button>` : ''}
      </div>
    </div>
  `).join('');
}

function setProgress(done, total) {
  const wrap = document.getElementById('batch-progress');
  const pct = total ? Math.round((done / total) * 100) : 0;
  wrap.classList.toggle('hidden', !exporting);
  wrap.setAttribute('aria-valuenow', String(pct));
  document.getElementById('batch-progress-bar').style.width = `${pct}%`;
}

/** Optimize every GIF that isn't done yet, then download all results as one zip */
async function exportAll() {
  if (items.length === 0 || exporting) return;
  const todo = items.filter((i) => !i.result);
  console.log(`[Batch] Exporting ${items.length} GIF(s) for Slack (${todo.length} to optimize)`);

  exporting = true;
  try {
    for (let i = 0; i < todo.length; i++) {
      const item = todo[i];
      item.status = 'working';
      setProgress(i, todo.length);
      render();
      try {
        item.result = await slackEmojiExport(item.data);
        item.resultUrl = URL.createObjectURL(new Blob([item.result], { type: 'image/gif' }));
        item.status = item.result.byteLength <= SLACK_MAX_SIZE ? 'ok' : 'over';
      } catch (err) {
        console.error(`[Batch] Failed to export ${item.name}:`, err);
        item.result = null;
        item.status = 'failed';
      }
    }
    setProgress(todo.length, todo.length);
  } finally {
    exporting = false;
    setProgress(0, 0);
    render();
  }

  const files = Object.fromEntries(items.filter((i) => i.result).map((i) => [i.name, i.result]));
  const exported = Object.keys(files).length;
  if (exported === 0) {
    showToast('Slack export failed for every GIF', 'error');
    return;
  }

  // GIFs are already compressed, so store without deflate
  const zip = zipSync(files, { level: 0 });
  downloadBlob(zip, 'slack-emojis.zip', 'application/zip');

  const over = items.filter((i) => i.status === 'over').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const parts = [`Exported ${exported} GIF${exported === 1 ? '' : 's'}`];
  if (over) parts.push(`${over} over 128 KB`);
  if (failed) parts.push(`${failed} failed`);
  showToast(parts.join(' · '), over || failed ? 'error' : 'success', 6000);
}
