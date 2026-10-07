import { getState, subscribe, commit } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile } from '../ffmpeg/engine.js';
import { assembleFramesCmd } from '../ffmpeg/commands.js';
import { optimizeGif } from '../gifsicle/optimize.js';
import { showToast } from '../components/toast.js';
import { registerTool } from '../components/toolbar.js';
import { runJob } from './shared.js';
import { extractFrames, renderFrameStrip } from '../components/frame-strip.js';
import { panelHeader, numberField, button, note } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const tool = {
  id: 'frames',
  label: 'Frames',
  iconName: 'frames',
  hue: 'violet',
  hint: 'Delete or reorder single frames.',
  render: renderFrames,
  exit: exitFrames,
};
registerTool(tool);

let frames = [];
let selected = new Set();
let focus = 0;
let originalCount = 0;
let edited = false;
let unsubIdle = null;

function frameName(i) {
  return `frame_${String(i + 1).padStart(4, '0')}.png`;
}

function releaseFrames() {
  for (const f of frames) URL.revokeObjectURL(f.url);
  frames = [];
  selected = new Set();
  focus = 0;
  edited = false;
}

function exitFrames() {
  unsubIdle?.();
  unsubIdle = null;
  releaseFrames();
  document.getElementById('frame-strip').classList.add('hidden');
  document.getElementById('frame-strip-inner').innerHTML = '';
}

/** Run fn once no FFmpeg job is running (a panel can re-render mid-job) */
function whenIdle(fn) {
  if (!getState().processing) { fn(); return; }
  unsubIdle = subscribe('processing', (busy) => {
    if (busy) return;
    unsubIdle();
    unsubIdle = null;
    // Defer so the finishing job can tear down its overlay before ours starts
    setTimeout(fn, 0);
  });
}

function renderFrames(panel) {
  const { meta } = getState();
  const fps = meta.duration > 0 ? Math.round(meta.frames / (meta.duration / 1000)) : 10;

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      <div class="flex items-center justify-between p-3 rounded-2xl bg-surface-2 text-sm">
        <span class="font-bold text-ink-2">Frames</span>
        <span id="frames-count" class="font-extrabold tabular-nums">Loading…</span>
      </div>
      <button id="frames-delete" type="button" class="btn btn-soft btn-block" disabled>${icon('trash')}<span>Delete selected</span></button>
      ${numberField({ id: 'frames-fps', label: 'Output frame rate', value: Math.min(50, Math.max(1, fps)), min: 1, max: 50, suffix: 'fps' })}
      ${button({ id: 'frames-assemble', label: 'Save frame changes', iconName: 'check', variant: 'primary', block: true, attrs: 'disabled' })}
      ${note('Click to select, Shift-click to select a range, and drag to reorder. With the keyboard: arrow keys move between frames, Alt+arrows move a frame, and Delete removes it.')}
    </div>
  `;

  document.getElementById('frame-strip').classList.remove('hidden');
  document.getElementById('frames-delete').addEventListener('click', () => deleteFrames([...selected]));
  document.getElementById('frames-assemble').addEventListener('click', reassemble);

  whenIdle(async () => {
    if (getState().activeTool !== 'frames') return;
    const extracted = await runJob('Splitting into frames…', () => extractFrames(getState().currentGif));
    if (!extracted) return;
    if (getState().activeTool !== 'frames') {
      for (const f of extracted) URL.revokeObjectURL(f.url);
      return;
    }
    releaseFrames();
    frames = extracted;
    originalCount = frames.length;
    update();
  });
}

function update(autoFocus = false) {
  focus = Math.max(0, Math.min(frames.length - 1, focus));
  renderFrameStrip({
    frames,
    selected,
    focus,
    autoFocus,
    onDelete: deleteFrames,
    onMove: moveFrame,
    onSelect: (idx, keyboard) => {
      focus = idx;
      update(keyboard);
    },
  });

  const count = document.getElementById('frames-count');
  if (!count) return;
  count.textContent = frames.length === originalCount ? `${frames.length}` : `${originalCount} → ${frames.length}`;
  const del = document.getElementById('frames-delete');
  del.disabled = selected.size === 0;
  del.querySelector('span').textContent = selected.size ? `Delete ${selected.size} selected` : 'Delete selected';
  document.getElementById('frames-assemble').disabled = !edited;
}

function deleteFrames(idxs) {
  if (idxs.length === 0) return;
  if (idxs.length >= frames.length) {
    showToast('A GIF needs at least one frame', 'error');
    return;
  }
  const drop = new Set(idxs);
  for (const i of drop) URL.revokeObjectURL(frames[i].url);
  frames = frames.filter((_, i) => !drop.has(i));
  selected = new Set();
  focus = Math.min(...idxs);
  edited = true;
  update(true);
}

function moveFrame(from, to) {
  const [item] = frames.splice(from, 1);
  frames.splice(to, 0, item);
  selected = new Set([to]);
  focus = to;
  edited = true;
  update(true);
}

async function reassemble() {
  if (frames.length === 0) return;
  const fps = Math.min(50, Math.max(1, parseInt(document.getElementById('frames-fps').value, 10) || 10));
  const count = frames.length;

  await runJob('Rebuilding your GIF…', async () => {
    try {
      for (let i = 0; i < count; i++) {
        await writeFile(frameName(i), new Uint8Array(await frames[i].blob.arrayBuffer()));
      }
      await runFFmpeg(assembleFramesCmd('frame_%04d.png', 'output.gif', fps));
      const result = await optimizeGif(await readFile('output.gif'));
      commit(`Frames: ${count} at ${fps} fps`, result);
      showToast(`Rebuilt with ${count} frames at ${fps} fps`, 'success');
    } finally {
      for (let i = 0; i < count; i++) await deleteFile(frameName(i));
      await deleteFile('output.gif');
    }
  });
}
