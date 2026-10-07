import { icon } from '../ui/icons.js';

const STYLES = {
  success: { iconName: 'check', chip: 'bg-ok text-surface' },
  error: { iconName: 'warn', chip: 'bg-danger text-surface' },
  info: { iconName: 'info', chip: 'bg-accent text-on-accent' },
};

const MAX_TOASTS = 3;

/**
 * Show a toast. Toasts sharing a `key` replace each other instead of stacking
 * (e.g. rapid undo/redo).
 */
export function showToast(message, type = 'info', duration = 3500, key = '') {
  const container = document.getElementById('toast-container');
  if (key) container.querySelector(`[data-key="${key}"]`)?.remove();
  const style = STYLES[type] || STYLES.info;

  const el = document.createElement('div');
  el.className = 'card pointer-events-auto w-full flex items-center gap-3 pl-2.5 pr-1.5 py-2 text-sm font-bold animate-pop-in';
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  if (key) el.dataset.key = key;
  el.innerHTML = `
    <span class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${style.chip}">${icon(style.iconName, 'w-4 h-4')}</span>
    <span class="flex-1 min-w-0"></span>
    <button type="button" class="btn btn-ghost btn-icon !p-1.5" aria-label="Dismiss">${icon('x', 'w-3.5 h-3.5')}</button>`;
  el.querySelector('span.flex-1').textContent = message;

  const dismiss = () => {
    if (!el.isConnected) return;
    el.style.transition = 'opacity 200ms, transform 200ms';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('button').addEventListener('click', dismiss);

  container.appendChild(el);
  while (container.children.length > MAX_TOASTS) container.firstElementChild.remove();

  setTimeout(dismiss, duration);
}
