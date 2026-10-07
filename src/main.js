import './styles/custom.css';

// Components
import { initDropzone } from './components/dropzone.js';
import { initPreview } from './components/preview.js';
import { initPlayer } from './components/player.js';
import { initToolbar, closeTool } from './components/toolbar.js';
import { initExportPanel } from './components/export-panel.js';
import { initBatch, clearBatch, hasBatchItems } from './components/batch.js';
import { initHistory } from './components/history.js';
import { initShortcuts } from './components/shortcuts.js';

// Tools (self-registering via registerTool; rail order = import order)
import './tools/resize.js';
import './tools/crop.js';
import './tools/trim.js';
import './tools/speed.js';
import './tools/reverse.js';
import './tools/frames.js';
import './tools/filters.js';
import './tools/compress.js';

import { getState, subscribe, resetState } from './utils/state.js';
import { initFFmpeg } from './ffmpeg/engine.js';
import { initJobOverlay } from './tools/shared.js';
import { icon, hydrateIcons } from './ui/icons.js';
import { confirmDialog } from './ui/dialog.js';
import { showView } from './ui/views.js';

// ---- Theme: light → dark → system ----
const THEME_KEY = 'gif-editor-theme';
const THEMES = ['light', 'dark', 'system'];
const THEME_ICONS = { light: 'sun', dark: 'moon', system: 'system' };
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function readTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark.matches);
  document.documentElement.classList.toggle('dark', dark);
  const btn = document.getElementById('theme-toggle');
  const next = THEMES[(THEMES.indexOf(pref) + 1) % THEMES.length];
  btn.innerHTML = icon(THEME_ICONS[pref], 'w-5 h-5');
  btn.setAttribute('aria-label', `Theme: ${pref}. Switch to ${next}`);
  btn.title = `Theme: ${pref}`;
}

function initThemeToggle() {
  let pref = readTheme();
  applyTheme(pref);
  systemDark.addEventListener('change', () => applyTheme(pref));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    pref = THEMES[(THEMES.indexOf(pref) + 1) % THEMES.length];
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode */ }
    applyTheme(pref);
    console.log(`[App] Theme set to ${pref}`);
  });
}

// ---- Engine status pill ----
let pillTimer = null;

function initEnginePill() {
  const pill = document.getElementById('engine-pill');
  const show = (visible) => {
    pill.classList.toggle('hidden', !visible);
    pill.classList.toggle('flex', visible);
  };

  subscribe('engine', (engine) => {
    clearTimeout(pillTimer);
    const iconEl = document.getElementById('engine-pill-icon');
    const retry = document.getElementById('engine-retry');
    retry.classList.toggle('hidden', engine.status !== 'error');
    pill.classList.toggle('text-danger', engine.status === 'error');

    if (engine.status === 'loading') {
      iconEl.innerHTML = icon('loader', 'w-4 h-4 animate-spin text-accent');
      document.getElementById('engine-pill-text').textContent = `Warming up engine · ${Math.round(engine.pct)}%`;
      pill.title = engine.text;
      show(true);
    } else if (engine.status === 'ready') {
      iconEl.innerHTML = icon('check', 'w-4 h-4 text-ok');
      document.getElementById('engine-pill-text').textContent = 'Engine ready';
      pillTimer = setTimeout(() => show(false), 1500);
    } else if (engine.status === 'error') {
      iconEl.innerHTML = icon('warn', 'w-4 h-4');
      document.getElementById('engine-pill-text').textContent = "Engine couldn't load";
      show(true);
    }
  });

  document.getElementById('engine-retry').addEventListener('click', () => initFFmpeg().catch(() => {}));
}

// ---- Home ----
async function goHome() {
  const { view, history } = getState();
  if (view === 'editor' && history.entries.length > 1) {
    const ok = await confirmDialog({
      title: 'Leave this GIF?',
      body: `You'll lose your ${history.entries.length - 1} edit(s). Download first if you want to keep them.`,
      confirmLabel: 'Leave',
    });
    if (!ok) return;
  }
  if (view === 'batch' && hasBatchItems()) {
    clearBatch();
    return;
  }
  closeTool();
  resetState();
  showView('landing');
}

// ---- Browser check ----
function checkBrowser() {
  const ua = navigator.userAgent;
  const isChromium = /Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !/Safari/i.test(ua.replace(/Chrome|Chromium|Edg|OPR|Brave/gi, ''));
  const isFirefox = /Firefox/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/Edg/i.test(ua);
  const isEdge = /Edg/i.test(ua);

  if (isChrome || isEdge || isChromium || isFirefox) return true;

  // Fallback: check for Chrome or Firefox-like features
  if (/Chrome\/\d/i.test(ua) || /Firefox\/\d/i.test(ua)) return true;

  return false;
}

function bootstrap() {
  console.log('[App] Bootstrapping GIF Editor…');
  hydrateIcons();
  initThemeToggle();

  if (!checkBrowser()) {
    console.warn('[App] Unsupported browser detected, blocking usage');
    document.getElementById('unsupported-banner').classList.remove('hidden');
    return;
  }
  console.log('[App] Browser check passed');

  initPlayer();
  initPreview();
  initToolbar();
  initHistory();
  initExportPanel();
  initBatch();
  initDropzone();
  initShortcuts();
  initJobOverlay();
  initEnginePill();
  subscribe('fileName', (name) => { document.getElementById('file-name').textContent = name ?? ''; });
  document.getElementById('home-btn').addEventListener('click', goHome);
  console.log('[App] All components initialized');
}

bootstrap();
