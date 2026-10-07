/** Small HTML-string helpers shared by tool panels, so every panel looks the same */
import { icon } from './icons.js';

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Header at the top of a tool panel: colored icon chip, title, one-line hint */
export function panelHeader({ label, iconName, hue, hint }) {
  return `
    <div class="flex items-start gap-3 mb-5 pr-10" data-hue="${hue}">
      <span class="hue-chip w-10 h-10 rounded-2xl flex items-center justify-center">${icon(iconName, 'w-5 h-5')}</span>
      <div class="min-w-0">
        <h2 class="text-lg font-extrabold leading-tight">${label}</h2>
        ${hint ? `<p class="text-sm text-muted leading-snug">${hint}</p>` : ''}
      </div>
    </div>`;
}

export function button({ id = '', label, iconName = '', variant = 'soft', size = '', block = false, attrs = '' }) {
  const cls = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ');
  return `<button ${id ? `id="${id}"` : ''} type="button" class="${cls}" ${attrs}>${iconName ? icon(iconName) : ''}<span>${label}</span></button>`;
}

/** Labelled range slider with a live value readout (`<output id="{id}-val">`) */
export function sliderField({ id, label, min, max, step = 1, value, display }) {
  return `
    <div>
      <div class="flex items-baseline justify-between mb-1.5">
        <label for="${id}" class="text-sm font-bold text-ink-2">${label}</label>
        <output id="${id}-val" for="${id}" class="text-sm font-extrabold tabular-nums">${display ?? value}</output>
      </div>
      <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
    </div>`;
}

export function numberField({ id, label, value, min = '', max = '', step = 1, suffix = '' }) {
  return `
    <div class="min-w-0 flex-1">
      <label for="${id}" class="text-xs font-bold text-muted block mb-1">${label}</label>
      <div class="relative">
        <input id="${id}" type="number" inputmode="decimal" value="${value}" min="${min}" max="${max}" step="${step}" class="field-input ${suffix ? 'pr-8' : ''}" />
        ${suffix ? `<span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">${suffix}</span>` : ''}
      </div>
    </div>`;
}

/**
 * Segmented control. options: [{value, label}]. Clicks are handled by bindSegmented.
 */
export function segmented({ id, label = '', options, value = null }) {
  return `
    <div>
      ${label ? `<p class="text-sm font-bold text-ink-2 mb-1.5" id="${id}-label">${label}</p>` : ''}
      <div id="${id}" class="segmented" role="group" ${label ? `aria-labelledby="${id}-label"` : ''}>
        ${options.map((o) => `<button type="button" data-value="${o.value}" aria-pressed="${String(o.value) === String(value)}">${o.label}</button>`).join('')}
      </div>
    </div>`;
}

/** Wire a segmented control; returns a setter to change the highlighted value programmatically */
export function bindSegmented(id, onChange) {
  const group = document.getElementById(id);
  const set = (value) => {
    for (const b of group.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
    }
  };
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    set(btn.dataset.value);
    onChange(btn.dataset.value);
  });
  return set;
}

/** Bind a slider to its <output> readout; returns the input element */
export function bindSlider(id, format = (v) => v, onInput = () => {}) {
  const input = document.getElementById(id);
  const out = document.getElementById(`${id}-val`);
  const update = () => {
    out.textContent = format(parseFloat(input.value));
    onInput(parseFloat(input.value));
  };
  input.addEventListener('input', update);
  input.sync = () => { out.textContent = format(parseFloat(input.value)); };
  return input;
}

/** Small explanatory note (e.g. "preview is approximate") */
export function note(text, iconName = 'info') {
  return `<p class="flex items-start gap-1.5 text-xs text-muted">${icon(iconName, 'w-3.5 h-3.5 mt-0.5')}<span>${text}</span></p>`;
}
