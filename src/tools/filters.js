import { getState, pushOperation, setState } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { filterCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { parseGifInfo } from '../utils/gif-info.js';
import { registerToolRenderer } from '../components/toolbar.js';
import { showProcessing, hideProcessing } from './shared.js';

registerToolRenderer('filters', renderFilters);

const presets = [
  { label: 'Grayscale', params: { brightness: 0, contrast: 1, saturation: 1, grayscale: true } },
  { label: 'High Contrast', params: { brightness: 0, contrast: 1.5, saturation: 1, grayscale: false } },
  { label: 'Bright', params: { brightness: 0.1, contrast: 1, saturation: 1, grayscale: false } },
  { label: 'Dim', params: { brightness: -0.1, contrast: 1, saturation: 1, grayscale: false } },
  { label: 'Vibrant', params: { brightness: 0, contrast: 1.1, saturation: 2, grayscale: false } },
  { label: 'Desaturated', params: { brightness: 0, contrast: 1, saturation: 0.3, grayscale: false } },
];

function renderFilters(panel) {
  panel.innerHTML = `
    <h3 class="font-semibold mb-3">Filters</h3>
    <div class="space-y-3">
      <div>
        <label for="filter-brightness" class="text-xs t-text-secondary block mb-1">Brightness: <span id="bright-val">0</span></label>
        <input id="filter-brightness" type="range" min="-0.5" max="0.5" step="0.05" value="0"
          class="w-full accent-indigo-500" />
      </div>
      <div>
        <label for="filter-contrast" class="text-xs t-text-secondary block mb-1">Contrast: <span id="contrast-val">1.0</span></label>
        <input id="filter-contrast" type="range" min="0.5" max="2" step="0.1" value="1"
          class="w-full accent-indigo-500" />
      </div>
      <div>
        <label for="filter-saturation" class="text-xs t-text-secondary block mb-1">Saturation: <span id="sat-val">1.0</span></label>
        <input id="filter-saturation" type="range" min="0" max="3" step="0.1" value="1"
          class="w-full accent-indigo-500" />
      </div>
      <div>
        <label class="inline-flex items-center gap-2 text-sm t-text-secondary cursor-pointer">
          <input id="filter-grayscale" type="checkbox" class="accent-indigo-500" />
          Grayscale
        </label>
      </div>
      <div>
        <p class="text-xs t-text-muted mb-1">Presets</p>
        <div class="flex gap-1 flex-wrap" id="filter-presets"></div>
      </div>
      <button id="filter-apply" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
        Apply Filter
      </button>
    </div>
  `;

  const bInput = document.getElementById('filter-brightness');
  const cInput = document.getElementById('filter-contrast');
  const sInput = document.getElementById('filter-saturation');

  bInput.addEventListener('input', () => document.getElementById('bright-val').textContent = bInput.value);
  cInput.addEventListener('input', () => document.getElementById('contrast-val').textContent = parseFloat(cInput.value).toFixed(1));
  sInput.addEventListener('input', () => document.getElementById('sat-val').textContent = parseFloat(sInput.value).toFixed(1));

  const presetsContainer = document.getElementById('filter-presets');
  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.className = 'px-2 py-1 text-xs t-bg-secondary t-bg-hover rounded';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      bInput.value = preset.params.brightness;
      cInput.value = preset.params.contrast;
      sInput.value = preset.params.saturation;
      document.getElementById('filter-grayscale').checked = preset.params.grayscale;
      document.getElementById('bright-val').textContent = preset.params.brightness;
      document.getElementById('contrast-val').textContent = preset.params.contrast.toFixed(1);
      document.getElementById('sat-val').textContent = preset.params.saturation.toFixed(1);
    });
    presetsContainer.appendChild(btn);
  }

  document.getElementById('filter-apply').addEventListener('click', async () => {
    const brightness = parseFloat(bInput.value);
    const contrast = parseFloat(cInput.value);
    const saturation = parseFloat(sInput.value);
    const grayscale = document.getElementById('filter-grayscale').checked;

    showProcessing('Applying filter…');
    try {
      await initFFmpeg();
      const { currentGif } = getState();
      await writeFile('input.gif', currentGif);
      await runFFmpeg(filterCmd('input.gif', 'output.gif', { brightness, contrast, saturation, grayscale }));
      const result = await readFile('output.gif');
      await deleteFile('input.gif');
      await deleteFile('output.gif');

      const newMeta = parseGifInfo(result);
      setState({ meta: newMeta });
      pushOperation('filters', { brightness, contrast, saturation, grayscale }, result);
      showToast('Filter applied!', 'success');
    } catch (err) {
      showToast(`Filter failed: ${err.message}`, 'error');
    } finally {
      hideProcessing();
    }
  });
}
