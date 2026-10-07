import { getState } from '../utils/state.js';
import { speedCmd } from '../ffmpeg/commands.js';
import { showToast } from '../components/toast.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import * as player from '../components/player.js';
import { panelHeader, sliderField, bindSlider, segmented, bindSegmented, button, note } from '../ui/components.js';

const tool = {
  id: 'speed',
  label: 'Speed',
  iconName: 'speed',
  hue: 'orange',
  hint: 'Slow-mo or fast-forward.',
  render: renderSpeed,
  exit: () => player.setRate(1),
};
registerTool(tool);

const PRESETS = [0.5, 1, 1.5, 2, 4].map((v) => ({ value: String(v), label: `${v}×` }));
const fmt = (v) => `${v.toFixed(2).replace(/\.?0+$/, '')}×`;

function renderSpeed(panel) {
  const { meta } = getState();

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      ${sliderField({ id: 'speed-slider', label: 'Playback speed', min: 0.25, max: 4, step: 0.25, value: 1, display: '1×' })}
      ${segmented({ id: 'speed-presets', options: PRESETS, value: '1' })}
      <p id="speed-summary" class="text-sm text-ink-2"></p>
      ${button({ id: 'speed-apply', label: 'Apply speed', iconName: 'check', variant: 'primary', block: true })}
      ${player.isFrameAccurate()
        ? note('The preview is already playing at this speed.', 'eye')
        : note('Live preview isn’t available in this browser.')}
    </div>
  `;

  const summarize = (speed) => {
    player.setRate(speed);
    document.getElementById('speed-summary').innerHTML =
      `Length: <strong>${(meta.duration / 1000).toFixed(2)}s</strong> → <strong>${(meta.duration / 1000 / speed).toFixed(2)}s</strong>`;
  };

  const setPreset = bindSegmented('speed-presets', (value) => {
    slider.value = value;
    slider.sync();
    summarize(parseFloat(value));
  });
  const slider = bindSlider('speed-slider', fmt, (v) => {
    setPreset(v);
    summarize(v);
  });
  summarize(1);

  document.getElementById('speed-apply').addEventListener('click', () => {
    const speed = parseFloat(slider.value);
    if (speed === 1) { showToast('Pick a speed other than 1×', 'info'); return; }
    applyEdit({
      label: `Speed ${fmt(speed)}`,
      busy: 'Changing speed…',
      passes: [speedCmd('input.gif', 'output.gif', speed)],
      success: () => `Speed set to ${fmt(speed)}`,
    });
  });
}
