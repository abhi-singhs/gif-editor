import { reverseCmds } from '../ffmpeg/commands.js';
import { registerTool } from '../components/toolbar.js';
import { applyEdit } from './shared.js';
import * as player from '../components/player.js';
import { panelHeader, button, note } from '../ui/components.js';

const tool = {
  id: 'reverse',
  label: 'Reverse',
  iconName: 'reverse',
  hue: 'cyan',
  hint: 'Play it backwards.',
  render: renderReverse,
  exit: () => player.setReverse(false),
};
registerTool(tool);

function renderReverse(panel) {
  const canPreview = player.canReverse();
  panel.innerHTML = `
    ${panelHeader(tool)}
    <div class="space-y-4">
      ${canPreview ? `
        <label class="flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-2 cursor-pointer">
          <span class="text-sm font-bold">Preview reversed</span>
          <input id="reverse-preview" type="checkbox" class="switch" checked />
        </label>` : ''}
      ${button({ id: 'reverse-apply', label: 'Reverse GIF', iconName: 'rewind', variant: 'primary', block: true })}
      ${canPreview ? '' : note('A live preview isn\u2019t available for this GIF. It\u2019s too large to hold in memory, or this browser can\u2019t decode it frame by frame.')}
    </div>
  `;

  const toggle = document.getElementById('reverse-preview');
  if (toggle) {
    player.setReverse(true);
    toggle.addEventListener('change', () => player.setReverse(toggle.checked));
  }

  document.getElementById('reverse-apply').addEventListener('click', () => {
    applyEdit({
      label: 'Reverse',
      busy: 'Reversing…',
      passes: reverseCmds('input.gif', 'output.gif'),
      success: () => 'Reversed! It now plays backwards.',
    });
  });
}
