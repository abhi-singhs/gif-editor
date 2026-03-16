import { setState, getState, subscribe } from '../utils/state.js';

const tools = [
  { id: 'resize',   icon: '↔',  label: 'Resize' },
  { id: 'crop',     icon: '⬒',  label: 'Crop' },
  { id: 'compress', icon: '📦', label: 'Compress' },
  { id: 'speed',    icon: '⏩', label: 'Speed' },
  { id: 'trim',     icon: '✂️',  label: 'Trim' },
  { id: 'reverse',  icon: '🔄', label: 'Reverse' },
  { id: 'frames',   icon: '🎞', label: 'Frames' },
  { id: 'filters',  icon: '🎨', label: 'Filters' },
];

let toolRenderers = {};

export function registerToolRenderer(toolId, renderer) {
  toolRenderers[toolId] = renderer;
}

export function initToolbar() {
  const container = document.getElementById('tool-buttons');

  for (const tool of tools) {
    const btn = document.createElement('button');
    btn.dataset.tool = tool.id;
    btn.className = 'flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs t-bg-hover transition-colors';
    btn.innerHTML = `<span class="text-lg" aria-hidden="true">${tool.icon}</span><span>${tool.label}</span>`;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => selectTool(tool.id));
    container.appendChild(btn);
  }

  subscribe('activeTool', updateActiveState);
}

function selectTool(toolId) {
  const current = getState().activeTool;
  const newTool = current === toolId ? null : toolId;
  setState({ activeTool: newTool });

  const panel = document.getElementById('tool-options');
  if (newTool && toolRenderers[newTool]) {
    panel.innerHTML = '';
    toolRenderers[newTool](panel);
  } else {
    panel.innerHTML = '<p class="t-text-muted text-sm">Select a tool to begin editing.</p>';
  }

  // Hide crop canvas when not cropping
  const cropCanvas = document.getElementById('crop-canvas');
  if (cropCanvas) {
    cropCanvas.classList.toggle('hidden', newTool !== 'crop');
  }

  // Hide frame strip when not in frames mode
  const frameStrip = document.getElementById('frame-strip');
  if (frameStrip) {
    frameStrip.classList.toggle('hidden', newTool !== 'frames');
  }
}

function updateActiveState(activeId) {
  const buttons = document.querySelectorAll('#tool-buttons button');
  for (const btn of buttons) {
    const isActive = btn.dataset.tool === activeId;
    btn.classList.toggle('bg-indigo-600', isActive);
    btn.classList.toggle('text-white', isActive);
    btn.classList.toggle('hover:bg-gray-800', false);
    btn.classList.toggle('t-bg-hover', !isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
}
