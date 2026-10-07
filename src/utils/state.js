/** Lightweight pub/sub state store with snapshot-based undo/redo history */
import { parseGifInfo } from './gif-info.js';

const MAX_HISTORY_ENTRIES = 30;
const MAX_HISTORY_BYTES = 256 * 1024 * 1024; // 256 MB of GIF snapshots

const initialState = {
  /** @type {'landing'|'editor'|'batch'} which screen is showing */
  view: 'landing',
  /** @type {Uint8Array|null} current GIF bytes (= history.entries[history.index].gif) */
  currentGif: null,
  /** GIF metadata for currentGif */
  meta: { width: 0, height: 0, frames: 0, duration: 0, delays: [], size: 0 },
  /** @type {string|null} original filename of the loaded GIF */
  fileName: null,
  /**
   * Snapshot history. Entry 0 is always the original upload.
   * @type {{entries: Array<{label: string, gif: Uint8Array, meta: object}>, index: number}}
   */
  history: { entries: [], index: -1 },
  /** @type {string|null} currently active tool */
  activeTool: null,
  /** whether an FFmpeg job is running */
  processing: false,
  /** FFmpeg engine status, shown as a header pill */
  engine: { status: 'idle', pct: 0, text: '' },
};

let state = structuredClone(initialState);
const listeners = new Map();

export function getState() {
  return state;
}

export function setState(partial) {
  const prev = { ...state };
  Object.assign(state, partial);

  for (const [key, cbs] of listeners) {
    if (key in partial) {
      for (const cb of cbs) cb(state[key], prev[key]);
    }
  }
}

export function subscribe(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key).delete(cb);
}

// ---- History ----

function showEntry(history) {
  const entry = history.entries[history.index];
  setState({ history, currentGif: entry.gif, meta: entry.meta });
}

/** Start a fresh editing session with a newly loaded GIF */
export function loadGif(gif, fileName) {
  const meta = parseGifInfo(gif);
  setState({ fileName });
  showEntry({ entries: [{ label: 'Original', gif, meta }], index: 0 });
  return meta;
}

/** Record an edit result as the new current state (drops any redo branch) */
export function commit(label, gif) {
  const { history } = state;
  const entries = history.entries.slice(0, history.index + 1);
  entries.push({ label, gif, meta: parseGifInfo(gif) });

  // Evict the oldest edits (never the original) to stay within budget
  let bytes = entries.reduce((sum, e) => sum + e.gif.byteLength, 0);
  while (entries.length > 2 && (entries.length > MAX_HISTORY_ENTRIES || bytes > MAX_HISTORY_BYTES)) {
    const [evicted] = entries.splice(1, 1);
    bytes -= evicted.gif.byteLength;
    console.log(`[History] Evicted "${evicted.label}" to stay within budget`);
  }

  showEntry({ entries, index: entries.length - 1 });
}

export function canUndo() {
  return state.history.index > 0;
}

export function canRedo() {
  return state.history.index < state.history.entries.length - 1;
}

/** Jump to a history entry; returns its label, or null if out of range */
export function jumpTo(index) {
  const { history } = state;
  if (index < 0 || index >= history.entries.length || index === history.index) return null;
  showEntry({ ...history, index });
  return history.entries[index].label;
}

export function undo() {
  const label = state.history.entries[state.history.index]?.label;
  return canUndo() && jumpTo(state.history.index - 1) !== null ? label : null;
}

export function redo() {
  return canRedo() ? jumpTo(state.history.index + 1) : null;
}

export function getOriginal() {
  return state.history.entries[0] ?? null;
}

export function resetState() {
  const { engine } = state;
  setState({ ...structuredClone(initialState), engine });
}
