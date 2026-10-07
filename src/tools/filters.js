import { filterCmds } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import * as player from '../components/player.js';
import { panelHeader, sliderField, bindSlider, button, note } from '../ui/components.js';

const tool = {
  id: 'filters',
  label: 'Filters',
  iconName: 'filters',
  hue: 'fuchsia',
  hint: 'Tweak the colors and mood.',
  render: renderFilters,
  exit: () => player.setPreviewFilter(''),
};
registerTool(tool);

const NEUTRAL = { brightness: 0, contrast: 1, saturation: 1, grayscale: false };

const presets = [
  { label: 'Original', params: NEUTRAL },
  { label: 'Grayscale', params: { ...NEUTRAL, grayscale: true } },
  { label: 'Punchy', params: { ...NEUTRAL, contrast: 1.5 } },
  { label: 'Bright', params: { ...NEUTRAL, brightness: 0.1 } },
  { label: 'Moody', params: { ...NEUTRAL, brightness: -0.1, saturation: 0.7 } },
  { label: 'Vibrant', params: { ...NEUTRAL, contrast: 1.1, saturation: 2 } },
  { label: 'Faded', params: { ...NEUTRAL, saturation: 0.3 } },
];

/** CSS approximation of FFmpeg's eq/hue filters, for the live preview */
function cssFilter({ brightness, contrast, saturation, grayscale }) {
  return [
    brightness !== 0 && `brightness(${1 + brightness})`,
    contrast !== 1 && `contrast(${contrast})`,
    saturation !== 1 && `saturate(${saturation})`,
    grayscale && 'grayscale(1)',
  ].filter(Boolean).join(' ');
}

function renderFilters(panel) {
  const url = player.getImageUrl();
  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      <div>
        <p class="text-sm font-bold text-ink-2 mb-1.5">Presets</p>
        <div id="filter-presets" class="grid grid-cols-4 gap-2">
          ${presets.map((p, i) => `
            <button type="button" data-preset="${i}" class="group flex flex-col items-center gap-1 text-xs font-bold text-ink-2">
              <span class="w-full aspect-square rounded-xl overflow-hidden checker ring-2 ring-transparent group-hover:ring-line group-aria-pressed:ring-accent transition-shadow">
                ${url ? `<img src="${url}" alt="" class="w-full h-full object-cover" style="filter:${cssFilter(p.params)}" />` : ''}
              </span>
              ${p.label}
            </button>`).join('')}
        </div>
      </div>
      ${sliderField({ id: 'filter-brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.05, value: 0, display: '0' })}
      ${sliderField({ id: 'filter-contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.1, value: 1, display: '1.0' })}
      ${sliderField({ id: 'filter-saturation', label: 'Saturation', min: 0, max: 3, step: 0.1, value: 1, display: '1.0' })}
      <label class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-2 cursor-pointer">
        <span class="text-sm font-bold">Grayscale</span>
        <input id="filter-grayscale" type="checkbox" class="switch" />
      </label>
      ${button({ id: 'filter-apply', label: 'Apply filter', iconName: 'check', variant: 'primary', block: true })}
      ${note('The live preview is a close approximation. The final colors may differ slightly.', 'eye')}
    </div>
  `;

  const read = () => ({
    brightness: parseFloat(bInput.value),
    contrast: parseFloat(cInput.value),
    saturation: parseFloat(sInput.value),
    grayscale: gInput.checked,
  });
  const preview = () => {
    const params = read();
    player.setPreviewFilter(cssFilter(params));
    // Highlight the preset that matches the current settings, if any
    for (const btn of document.querySelectorAll('[data-preset]')) {
      const p = presets[btn.dataset.preset].params;
      btn.setAttribute('aria-pressed', String(Object.keys(p).every((k) => p[k] === params[k])));
    }
  };

  const signed = (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)).replace(/\.?0+$/, '') || '0';
  const bInput = bindSlider('filter-brightness', signed, preview);
  const cInput = bindSlider('filter-contrast', (v) => v.toFixed(1), preview);
  const sInput = bindSlider('filter-saturation', (v) => v.toFixed(1), preview);
  const gInput = document.getElementById('filter-grayscale');
  gInput.addEventListener('change', preview);

  document.getElementById('filter-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const { params } = presets[btn.dataset.preset];
    bInput.value = params.brightness;
    cInput.value = params.contrast;
    sInput.value = params.saturation;
    gInput.checked = params.grayscale;
    for (const input of [bInput, cInput, sInput]) input.sync();
    preview();
  });
  preview();

  document.getElementById('filter-apply').addEventListener('click', () => {
    const params = read();
    if (!cssFilter(params)) { showToast('Move a slider or pick a preset first', 'info'); return; }
    applyEdit({
      label: 'Filter',
      busy: 'Applying filter…',
      passes: filterCmds('input.gif', 'output.gif', params),
      success: () => 'Filter applied!',
    });
  });
}
