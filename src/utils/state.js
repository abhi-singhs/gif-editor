/** Lightweight pub/sub state store */

const MAX_UNDO_OPERATIONS = 20;
const CHECKPOINT_CACHE_SIZE = 3;

const initialState = {
  /** @type {Uint8Array|null} original GIF bytes (never mutated) */
  originalGif: null,
  /** @type {Uint8Array|null} current GIF bytes after edits */
  currentGif: null,
  /** @type {string|null} object URL for preview */
  previewUrl: null,
  /** GIF metadata */
  meta: { width: 0, height: 0, frames: 0, duration: 0, size: 0 },
  /** @type {Array<{tool: string, params: object}>} operation history for undo */
  operations: [],
  /** @type {Map<number, Uint8Array>} blob checkpoints keyed by operation index */
  checkpoints: new Map(),
  /** @type {string|null} currently active tool */
  activeTool: null,
  /** whether FFmpeg is currently processing */
  processing: false,
  /** whether FFmpeg is loaded */
  ffmpegReady: false,
};

let state = { ...initialState, checkpoints: new Map() };
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
  // wildcard listeners
  if (listeners.has('*')) {
    for (const cb of listeners.get('*')) cb(state, prev);
  }
}

export function subscribe(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key).delete(cb);
}

export function revokePreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    setState({ previewUrl: null });
  }
}

export function setPreviewFromGif(gifBytes) {
  revokePreview();
  const blob = new Blob([gifBytes], { type: 'image/gif' });
  setState({ previewUrl: URL.createObjectURL(blob) });
}

/** Push an operation to the undo stack */
export function pushOperation(tool, params, resultGif) {
  const ops = [...state.operations, { tool, params }];
  if (ops.length > MAX_UNDO_OPERATIONS) {
    ops.shift();
    // shift checkpoints too
    const newCheckpoints = new Map();
    for (const [idx, data] of state.checkpoints) {
      if (idx > 0) newCheckpoints.set(idx - 1, data);
    }
    state.checkpoints = newCheckpoints;
  }

  // Cache checkpoint every few operations for faster undo
  const checkpoints = new Map(state.checkpoints);
  if (ops.length % Math.ceil(MAX_UNDO_OPERATIONS / CHECKPOINT_CACHE_SIZE) === 0) {
    // Keep only CHECKPOINT_CACHE_SIZE most recent
    if (checkpoints.size >= CHECKPOINT_CACHE_SIZE) {
      const oldest = Math.min(...checkpoints.keys());
      checkpoints.delete(oldest);
    }
    checkpoints.set(ops.length - 1, resultGif);
  }

  setState({ operations: ops, currentGif: resultGif, checkpoints });
  setPreviewFromGif(resultGif);
}

/** Pop the last operation (undo) */
export function popOperation() {
  if (state.operations.length === 0) return null;
  const ops = state.operations.slice(0, -1);
  setState({ operations: ops });
  return ops;
}

export function resetState() {
  revokePreview();
  state = { ...initialState, checkpoints: new Map() };
}
