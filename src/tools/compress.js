import { getState } from '../utils/state.js';
import { compressCmds } from '../ffmpeg/commands.js';
import { formatSize } from '../utils/file-utils.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import { panelHeader, sliderField, bindSlider, segmented, bindSegmented, button, note } from '../ui/components.js';

const tool = {
  id: 'compress',
  label: 'Compress',
  iconName: 'compress',
  hue: 'emerald',
  hint: 'Shrink the file size.',
  render: renderCompress,
};
registerTool(tool);

const PRESETS = {
  light: { colors: 192, fps: 0, lossy: 0 },
  balanced: { colors: 128, fps: 15, lossy: 40 },
  tiny: { colors: 48, fps: 10, lossy: 100 },
};

function renderCompress(panel) {
  const { meta } = getState();
  const currentFps = meta.duration > 0 ? Math.round(meta.frames / (meta.duration / 1000)) : 0;

  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      ${segmented({
        id: 'compress-presets',
        label: 'Quick presets',
        options: [
          { value: 'light', label: 'Light' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'tiny', label: 'Tiny' },
        ],
      })}
      ${sliderField({ id: 'compress-colors', label: 'Colors', min: 8, max: 256, step: 8, value: 256 })}
      ${sliderField({ id: 'compress-fps', label: 'Frame rate', min: 0, max: 30, step: 1, value: 0, display: 'Original' })}
      ${sliderField({ id: 'compress-lossy', label: 'Lossy', min: 0, max: 200, step: 10, value: 0, display: 'Off' })}
      <div class="flex items-center justify-between p-3 rounded-2xl bg-surface-2 text-sm">
        <span class="font-bold text-ink-2">Current size</span>
        <span class="font-extrabold tabular-nums">${formatSize(meta.size)}</span>
      </div>
      ${button({ id: 'compress-apply', label: 'Compress', iconName: 'check', variant: 'primary', block: true })}
      ${note(`Fewer colors, a lower frame rate and more lossy make smaller files. Lossy trades a little grain for a lot of size. This GIF plays at about ${currentFps} fps.`)}
    </div>
  `;

  const fpsLabel = (v) => (v === 0 ? 'Original' : `${v} fps`);
  const colorsInput = bindSlider('compress-colors', (v) => String(v), () => setPreset(null));
  const fpsInput = bindSlider('compress-fps', fpsLabel, () => setPreset(null));
  const lossyInput = bindSlider('compress-lossy', (v) => (v === 0 ? 'Off' : String(v)), () => setPreset(null));

  const setPreset = bindSegmented('compress-presets', (value) => {
    colorsInput.value = PRESETS[value].colors;
    fpsInput.value = PRESETS[value].fps;
    lossyInput.value = PRESETS[value].lossy;
    colorsInput.sync();
    fpsInput.sync();
    lossyInput.sync();
  });

  document.getElementById('compress-apply').addEventListener('click', () => {
    const colors = parseInt(colorsInput.value, 10);
    const fps = parseInt(fpsInput.value, 10) || null;
    const lossy = parseInt(lossyInput.value, 10) || 0;
    applyEdit({
      label: `Compress (${colors} colors${fps ? `, ${fps} fps` : ''}${lossy ? `, lossy ${lossy}` : ''})`,
      busy: 'Compressing…',
      passes: compressCmds('input.gif', 'output.gif', { colors, fps }),
      optimize: { lossy },
      success: (result, before) => {
        const pct = Math.round((1 - result.byteLength / before.byteLength) * 100);
        return pct > 0
          ? `Compressed to ${formatSize(result.byteLength)} (${pct}% smaller)`
          : `Now ${formatSize(result.byteLength)}. That didn't shrink it, so try fewer colors.`;
      },
    });
  });
}
