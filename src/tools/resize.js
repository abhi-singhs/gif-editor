import { getState } from '../utils/state.js';
import { resizeCmds } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { formatSize } from '../utils/file-utils.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import { panelHeader, numberField, segmented, bindSegmented, button, note } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const tool = {
  id: 'resize',
  label: 'Resize',
  iconName: 'resize',
  hue: 'sky',
  hint: 'Make it bigger or smaller.',
  render: renderResize,
};
registerTool(tool);

const PRESETS = [
  { value: '0.25', label: '25%' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '2', label: '200%' },
  { value: 'fit128', label: 'Fit 128' },
];

let locked = true;

function renderResize(panel) {
  const { meta } = getState();
  const aspectRatio = meta.width / meta.height;

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      <div class="flex gap-2 items-end">
        ${numberField({ id: 'resize-w', label: 'Width', value: meta.width, min: 1, max: 4096, suffix: 'px' })}
        <button id="resize-lock" type="button" class="btn btn-soft btn-icon mb-0.5 shrink-0" aria-pressed="${locked}"></button>
        ${numberField({ id: 'resize-h', label: 'Height', value: meta.height, min: 1, max: 4096, suffix: 'px' })}
      </div>
      ${segmented({ id: 'resize-presets', label: 'Quick sizes', options: PRESETS })}
      <p id="resize-summary" class="text-sm text-ink-2"></p>
      ${button({ id: 'resize-apply', label: 'Apply resize', iconName: 'check', variant: 'primary', block: true })}
      ${note('Fit 128 makes the longest side 128px, which suits Slack emoji.')}
    </div>
  `;

  const wInput = document.getElementById('resize-w');
  const hInput = document.getElementById('resize-h');
  const lockBtn = document.getElementById('resize-lock');

  const renderLock = () => {
    lockBtn.innerHTML = icon(locked ? 'lock' : 'unlock', 'w-4 h-4');
    lockBtn.setAttribute('aria-pressed', String(locked));
    lockBtn.setAttribute('aria-label', locked ? 'Aspect ratio locked' : 'Aspect ratio unlocked');
    lockBtn.title = locked ? 'Aspect ratio locked' : 'Aspect ratio unlocked';
    lockBtn.classList.toggle('btn-primary', locked);
    lockBtn.classList.toggle('btn-soft', !locked);
  };
  const summarize = () => {
    const w = parseInt(wInput.value, 10) || 0;
    const pct = Math.round((w / meta.width) * 100);
    document.getElementById('resize-summary').innerHTML =
      `<strong>${meta.width}×${meta.height}</strong> → <strong>${w}×${parseInt(hInput.value, 10) || 0}</strong> <span class="text-muted">(${pct}%)</span>`;
  };
  renderLock();
  summarize();

  const setPreset = bindSegmented('resize-presets', (value) => {
    const scale = value === 'fit128' ? 128 / Math.max(meta.width, meta.height) : parseFloat(value);
    wInput.value = Math.max(1, Math.round(meta.width * scale));
    hInput.value = Math.max(1, Math.round(meta.height * scale));
    summarize();
  });

  lockBtn.addEventListener('click', () => {
    locked = !locked;
    renderLock();
  });
  wInput.addEventListener('input', () => {
    if (locked) hInput.value = Math.max(1, Math.round(parseInt(wInput.value, 10) / aspectRatio)) || '';
    setPreset(null);
    summarize();
  });
  hInput.addEventListener('input', () => {
    if (locked) wInput.value = Math.max(1, Math.round(parseInt(hInput.value, 10) * aspectRatio)) || '';
    setPreset(null);
    summarize();
  });

  document.getElementById('resize-apply').addEventListener('click', () => {
    const w = parseInt(wInput.value, 10);
    const h = parseInt(hInput.value, 10);
    if (!w || !h || w < 1 || h < 1 || w > 4096 || h > 4096) { showToast('Pick a size between 1 and 4096 px', 'error'); return; }
    if (w === meta.width && h === meta.height) { showToast("That's already the current size", 'info'); return; }

    applyEdit({
      label: `Resize to ${w}×${h}`,
      busy: 'Resizing…',
      passes: resizeCmds('input.gif', 'output.gif', w, h),
      success: (result) => `Resized to ${w}×${h} (${formatSize(result.byteLength)})`,
    });
  });
}
