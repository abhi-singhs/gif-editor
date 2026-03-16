import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { setState } from '../utils/state.js';

const DB_NAME = 'gif-editor-cache';
const STORE_NAME = 'ffmpeg';
const FFMPEG_VERSION = '0.12.10';
const CORE_VERSION = '0.12.6';
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpeg = null;
let loaded = false;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCached(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch {
    // cache failure is non-fatal
  }
}

function showLoader() {
  document.getElementById('ffmpeg-loader')?.classList.remove('hidden');
}

function hideLoader() {
  document.getElementById('ffmpeg-loader')?.classList.add('hidden');
}

function updateProgress(pct, text) {
  const bar = document.getElementById('ffmpeg-progress-bar');
  const label = document.getElementById('ffmpeg-progress-text');
  if (bar) {
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.parentElement?.setAttribute('aria-valuenow', String(Math.round(pct)));
  }
  if (label) label.textContent = text;
}

async function fetchWithProgress(url, cacheKey) {
  // Check IndexedDB cache first
  const cached = await getCached(cacheKey);
  if (cached?.version === CORE_VERSION && cached?.data) {
    console.log('[FFmpeg] Loaded WASM from IndexedDB cache');
    return URL.createObjectURL(new Blob([cached.data], { type: 'application/wasm' }));
  }
  console.log('[FFmpeg] Cache miss, downloading WASM from', url);

  const response = await fetch(url);
  const contentLength = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      const pct = Math.round((received / contentLength) * 100);
      const mb = (received / 1024 / 1024).toFixed(1);
      const totalMb = (contentLength / 1024 / 1024).toFixed(1);
      updateProgress(pct, `Downloading engine… ${mb} / ${totalMb} MB`);
    }
  }

  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  // Store in IndexedDB for next time
  console.log(`[FFmpeg] Download complete: ${(received / 1024 / 1024).toFixed(1)} MB, caching to IndexedDB`);
  await setCached(cacheKey, { version: CORE_VERSION, data });

  return URL.createObjectURL(new Blob([data], { type: 'application/wasm' }));
}

export async function initFFmpeg() {
  if (loaded) return ffmpeg;

  console.log('[FFmpeg] Initializing FFmpeg.wasm…');
  showLoader();
  updateProgress(0, 'Initializing…');

  try {
    ffmpeg = new FFmpeg();

    updateProgress(5, 'Loading core…');

    const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await fetchWithProgress(`${BASE_URL}/ffmpeg-core.wasm`, 'ffmpeg-core-wasm');

    updateProgress(90, 'Starting engine…');

    await ffmpeg.load({ coreURL, wasmURL });

    loaded = true;
    setState({ ffmpegReady: true });
    updateProgress(100, 'Ready!');
    console.log('[FFmpeg] Engine loaded and ready');
  } finally {
    setTimeout(hideLoader, 400);
  }

  return ffmpeg;
}

export async function runFFmpeg(args) {
  console.log('[FFmpeg] exec:', args.join(' '));
  const ff = await initFFmpeg();
  const start = performance.now();
  await ff.exec(args);
  console.log(`[FFmpeg] exec done in ${(performance.now() - start).toFixed(0)}ms`);
}

export async function writeFile(name, data) {
  console.log(`[FFmpeg] writeFile: ${name} (${(data.byteLength / 1024).toFixed(1)} KB)`);
  const ff = await initFFmpeg();
  // Always copy to prevent the original ArrayBuffer from being detached
  const copy = new Uint8Array(data);
  await ff.writeFile(name, copy);
}

export async function readFile(name) {
  const ff = await initFFmpeg();
  const data = await ff.readFile(name);
  console.log(`[FFmpeg] readFile: ${name} (${(data.byteLength / 1024).toFixed(1)} KB)`);
  return data;
}

export async function deleteFile(name) {
  const ff = await initFFmpeg();
  try {
    await ff.deleteFile(name);
  } catch {
    // ignore if file doesn't exist
  }
}

export function isLoaded() {
  return loaded;
}
