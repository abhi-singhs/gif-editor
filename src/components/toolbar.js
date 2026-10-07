import { setState, getState, subscribe } from '../utils/state.js';
import { icon } from '../ui/icons.js';
import { renderIdlePanel } from './history.js';
import * as player from './player.js';

/**
 * @typedef {object} Tool
 * @property {string} id
 * @property {string} label
 * @property {string} iconName
 * @property {string} hue        accent hue name (see [data-hue] in custom.css)
 * @property {string} hint       one-line description shown in the panel header
 * @property {(panel: HTMLElement) => void} render  build the options panel
 * @property {() => void} [exit] tear down live previews / overlays when leaving the tool
 */

/** @type {Tool[]} */
const tools = [];

/** Tools self-register on import; rail order = registration order, hotkey = position */
export function registerTool(tool) {
  tools.push(tool);
}

export function getTools() {
  return tools;
}

export function initToolbar() {
  const rail = document.getElementById('tool-rail');
  rail.innerHTML = tools.map((tool, i) => `
    <button type="button" data-tool="${tool.id}" data-hue="${tool.hue}" aria-pressed="false"
      aria-keyshortcuts="${i + 1}" title="${tool.label} (${i + 1})"
      class="tool-btn shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-2xl text-xs font-bold text-ink-2 hover:bg-surface-2 transition-colors min-w-16 lg:w-full">
      <span class="hue-chip w-9 h-9 rounded-xl flex items-center justify-center transition-colors">${icon(tool.iconName, 'w-5 h-5')}</span>
      <span>${tool.label}</span>
    </button>`).join('');

  rail.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (btn) selectTool(btn.dataset.tool);
  });

  document.getElementById('panel-close').addEventListener('click', () => selectTool(null));

  subscribe('activeTool', updateActiveState);
  // Edits, undo and redo change the GIF under the tool: rebuild its panel once the
  // player has the new GIF, so tools know which live previews are available
  player.on('load', () => {
    if (getState().view === 'editor') renderPanel();
  });
  renderPanel();
}

function getTool(id) {
  return tools.find((t) => t.id === id) ?? null;
}

/** Select a tool by id (toggles off if already active); null closes the current tool */
export function selectTool(toolId) {
  if (getState().processing) return;
  const current = getState().activeTool;
  const next = current === toolId ? null : toolId;
  getTool(current)?.exit?.();
  setState({ activeTool: next });
  renderPanel();
}

/** Leave the active tool (e.g. before loading a new GIF) */
export function closeTool() {
  getTool(getState().activeTool)?.exit?.();
  setState({ activeTool: null });
}

/** Select by 1-based rail position (keyboard shortcut) */
export function selectToolByIndex(i) {
  if (tools[i]) selectTool(tools[i].id);
}

function renderPanel() {
  const panel = document.getElementById('tool-options');
  const tool = getTool(getState().activeTool);
  if (tool) {
    tool.exit?.();
    panel.innerHTML = '';
    tool.render(panel);
  } else {
    renderIdlePanel(panel);
  }
}

function updateActiveState(activeId) {
  for (const btn of document.querySelectorAll('#tool-rail [data-tool]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === activeId));
  }
  // Mobile: the options panel is a bottom sheet that only opens with a tool
  const panel = document.getElementById('panel');
  panel.classList.toggle('max-lg:hidden', !activeId);
  document.getElementById('panel-close').classList.toggle('hidden', !activeId);
}
