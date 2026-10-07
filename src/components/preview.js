import { subscribe, getOriginal } from '../utils/state.js';
import { formatSize } from '../utils/file-utils.js';
import { icon } from '../ui/icons.js';

const SLACK_MAX_SIZE = 128 * 1024;

const chip = (content, cls = 'bg-surface-2 text-ink-2', attrs = '') =>
  `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${cls}" ${attrs}>${content}</span>`;

/** Metadata bar under the stage: dimensions, frames, duration, fps, size delta, Slack fit */
export function initPreview() {
  subscribe('meta', (meta) => {
    const bar = document.getElementById('metadata-bar');
    if (!meta?.width) { bar.innerHTML = ''; return; }

    const seconds = meta.duration / 1000;
    const fps = seconds > 0 ? (meta.frames / seconds).toFixed(1) : '0';
    const original = getOriginal();

    let size = formatSize(meta.size);
    if (original && original.meta.size !== meta.size) {
      const pct = Math.round((meta.size / original.meta.size - 1) * 100);
      const tone = pct <= 0 ? 'text-ok' : 'text-warn';
      size = `${formatSize(original.meta.size)} → ${size} <span class="${tone}">(${pct > 0 ? '+' : ''}${pct}%)</span>`;
    }

    const slackFits = meta.size <= SLACK_MAX_SIZE && meta.width === meta.height;
    const slack = slackFits
      ? chip(`${icon('check', 'w-3 h-3')} Slack-ready`, 'bg-ok/15 text-ok')
      : chip(`${icon('slack', 'w-3 h-3')} ${meta.size > SLACK_MAX_SIZE ? `${formatSize(meta.size - SLACK_MAX_SIZE)} over Slack limit` : 'Not square for Slack'}`,
        'bg-surface-2 text-muted', 'title="Slack emoji: square, ≤128 KB. Use the Slack emoji button to fix automatically."');

    bar.innerHTML = [
      chip(`${meta.width} × ${meta.height}`, undefined, 'title="Dimensions"'),
      chip(`${meta.frames} frames`),
      chip(`${seconds.toFixed(2)}s`, undefined, 'title="Duration"'),
      chip(`${fps} fps`),
      chip(size, undefined, 'title="File size"'),
      slack,
    ].join('');
  });
}
