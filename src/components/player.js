/**
 * Stage player: frame-accurate GIF playback on a canvas via WebCodecs ImageDecoder,
 * with zoom, before/after compare and live-preview hooks (rate, reverse, loop range, CSS filter).
 * Falls back to a plain animated <img> where ImageDecoder is unavailable.
 */
import { subscribe, getState, getOriginal } from '../utils/state.js';
import { icon } from '../ui/icons.js';

/** Decoded frames are cached as ImageBitmaps when they fit in this budget */
const FRAME_CACHE_BUDGET = 192 * 1024 * 1024;
const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4, 6, 8];
const MAX_FIT_UPSCALE = 3;

const hasImageDecoder = typeof window.ImageDecoder !== 'undefined';

let canvas, ctx, img, wrap, viewport, comparePane, compareImg;
let gen = 0;             // load generation; stale async work checks this
let decoder = null;
let bitmaps = [];        // ImageBitmap|undefined per frame (cache)
let cacheable = false;
let decoded = false;     // canvas mode active for current GIF
let count = 0;
let delays = [];
let index = 0;
let playing = true;
let rate = 1;
let reverse = false;
let range = null;        // [start, endExclusive] loop range, or null for all frames
let timer = null;
let zoom = 'fit';
let scale = 1;
let comparing = false;
let imgUrl = null;
let compareUrl = null;
const listeners = { frame: new Set(), layout: new Set(), load: new Set() };

function emit(type) {
  for (const cb of listeners[type]) cb();
}

/**
 * Subscribe to 'frame' (index/playing changed), 'layout' (size/zoom changed)
 * or 'load' (a new GIF is showing and its capabilities are known)
 */
export function on(type, cb) {
  listeners[type].add(cb);
  return () => listeners[type].delete(cb);
}

export function initPlayer() {
  canvas = document.getElementById('player-canvas');
  ctx = canvas.getContext('2d');
  img = document.getElementById('preview-img');
  wrap = document.getElementById('media-wrap');
  viewport = document.getElementById('viewport');
  comparePane = document.getElementById('compare-pane');
  compareImg = document.getElementById('compare-img');

  subscribe('currentGif', (gif) => {
    if (gif) load(gif, getState().meta);
    else unload();
  });

  new ResizeObserver(() => layout()).observe(viewport);

  // Controls
  document.getElementById('pc-play').addEventListener('click', togglePlay);
  document.getElementById('pc-prev').addEventListener('click', () => step(-1));
  document.getElementById('pc-next').addEventListener('click', () => step(1));
  const scrub = document.getElementById('pc-scrub');
  scrub.addEventListener('input', () => { pause(); seek(parseInt(scrub.value, 10)); });
  document.getElementById('zoom-in').addEventListener('click', zoomIn);
  document.getElementById('zoom-out').addEventListener('click', zoomOut);
  document.getElementById('zoom-label').addEventListener('click', toggleZoom);
  document.getElementById('compare-btn').addEventListener('click', toggleCompare);

  on('frame', renderControls);
}

// ---- Loading ----

function unload() {
  gen++;
  stopTimer();
  closeDecoder();
  if (imgUrl) URL.revokeObjectURL(imgUrl);
  imgUrl = null;
  img.removeAttribute('src');
  setCompare(false);
  zoom = 'fit';
  range = null;
  rate = 1;
  reverse = false;
  setPreviewFilter('');
}

function closeDecoder() {
  for (const b of bitmaps) b?.close();
  bitmaps = [];
  decoder?.close();
  decoder = null;
  decoded = false;
}

async function load(gif, meta) {
  const myGen = ++gen;
  stopTimer();
  closeDecoder();
  index = 0;
  range = null;

  // Always keep an <img> URL around: used by the fallback and filter-preset swatches
  if (imgUrl) URL.revokeObjectURL(imgUrl);
  imgUrl = URL.createObjectURL(new Blob([gif], { type: 'image/gif' }));

  canvas.width = meta.width;
  canvas.height = meta.height;
  layout();

  if (hasImageDecoder) {
    try {
      decoder = new ImageDecoder({ data: gif, type: 'image/gif' });
      await decoder.tracks.ready;
      await decoder.completed;
      if (myGen !== gen) return;
      count = decoder.tracks.selectedTrack.frameCount;
      delays = Array.from({ length: count }, (_, i) => normalizeDelay(meta.delays?.[i]));
      cacheable = meta.width * meta.height * 4 * count <= FRAME_CACHE_BUDGET;
      decoded = true;
      canvas.classList.remove('hidden');
      img.classList.add('hidden');
      document.getElementById('player-controls').classList.remove('invisible');
      await drawFrame(0);
      if (playing) startTimer();
      emit('load');
      emit('frame');
      if (cacheable) cacheAllFrames(myGen);
      return;
    } catch (err) {
      console.warn('[Player] ImageDecoder failed, falling back to <img>:', err);
      closeDecoder();
      if (myGen !== gen) return;
    }
  }

  // Fallback: native animated <img>, no frame controls
  count = meta.frames;
  delays = (meta.delays || []).map(normalizeDelay);
  img.src = imgUrl;
  img.classList.remove('hidden');
  canvas.classList.add('hidden');
  document.getElementById('player-controls').classList.add('invisible');
  emit('load');
  emit('frame');
}

/** Browsers render GIF delays of ≤10ms as 100ms; mirror that so previews match */
function normalizeDelay(ms) {
  return !ms || ms <= 10 ? 100 : ms;
}

async function cacheAllFrames(myGen) {
  for (let i = 0; i < count; i++) {
    if (myGen !== gen) return;
    if (bitmaps[i]) continue;
    const { image } = await decoder.decode({ frameIndex: i });
    if (myGen !== gen) { image.close(); return; }
    bitmaps[i] = await createImageBitmap(image);
    image.close();
  }
  console.log(`[Player] Cached ${count} decoded frames`);
  emit('frame');
}

async function drawFrame(i) {
  const myGen = gen;
  if (bitmaps[i]) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmaps[i], 0, 0);
    return;
  }
  const { image } = await decoder.decode({ frameIndex: i });
  if (myGen === gen) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
  }
  image.close();
}

// ---- Playback ----

function stopTimer() {
  clearTimeout(timer);
  timer = null;
}

function bounds() {
  return range ?? [0, count];
}

function nextIndex(i, dir) {
  const [start, end] = bounds();
  let n = i + dir;
  if (n >= end) n = start;
  if (n < start) n = end - 1;
  return n;
}

function startTimer() {
  stopTimer();
  const myGen = gen;
  const tick = () => {
    timer = setTimeout(async () => {
      if (myGen !== gen || !playing) return;
      index = nextIndex(index, reverse ? -1 : 1);
      await drawFrame(index);
      if (myGen !== gen || !playing) return;
      emit('frame');
      tick();
    }, delays[index] / rate);
  };
  tick();
}

export function play() {
  if (!decoded) return;
  playing = true;
  startTimer();
  emit('frame');
}

export function pause() {
  playing = false;
  stopTimer();
  emit('frame');
}

export function togglePlay() {
  if (playing) pause();
  else play();
}

export async function seek(i) {
  if (!decoded) return;
  const [start, end] = bounds();
  index = Math.max(start, Math.min(end - 1, i));
  await drawFrame(index);
  emit('frame');
  if (playing) startTimer();
}

export function step(dir) {
  if (!decoded) return;
  pause();
  seek(nextIndex(index, dir));
}

// ---- Live-preview hooks used by tools ----

export function setRate(r) {
  rate = r;
}

/** Reverse playback needs random access, so only offered when frames are cached */
export function canReverse() {
  return decoded && cacheable;
}

export function setReverse(on) {
  reverse = on && canReverse();
}

/** Loop only frames [start, endExclusive); pass null to clear */
export function setLoopRange(r) {
  range = r && decoded ? [Math.max(0, r[0]), Math.min(count, r[1])] : null;
  if (range && (index < range[0] || index >= range[1])) seek(range[0]);
}

export function setPreviewFilter(css) {
  canvas.style.filter = css;
  img.style.filter = css;
}

export function isFrameAccurate() {
  return decoded;
}

export function getFrameInfo() {
  return { index, count, delays, playing };
}

/** The <img> URL of the current GIF (for swatch thumbnails) */
export function getImageUrl() {
  return imgUrl;
}

/** Cached bitmap for a frame, or null if not decoded yet */
export function getBitmap(i) {
  return bitmaps[i] ?? null;
}

/** The element the GIF is displayed in, for mapping overlay coordinates */
export function getMediaWrap() {
  return wrap;
}

export function getScale() {
  return scale;
}

// ---- Zoom & layout ----

function fitScale(pane, w, h) {
  const pad = 24;
  const s = Math.min((pane.clientWidth - pad) / w, (pane.clientHeight - pad) / h);
  return Math.max(0.05, Math.min(s, MAX_FIT_UPSCALE));
}

function layout() {
  const { meta } = getState();
  if (!meta?.width) return;

  scale = zoom === 'fit' ? fitScale(viewport, meta.width, meta.height) : zoom;
  wrap.style.width = `${Math.round(meta.width * scale)}px`;
  wrap.style.height = `${Math.round(meta.height * scale)}px`;
  const pixelated = scale > 1;
  canvas.classList.toggle('pixelated', pixelated);
  img.classList.toggle('pixelated', pixelated);

  if (comparing) {
    const orig = getOriginal().meta;
    const s = fitScale(comparePane, orig.width, orig.height);
    compareImg.style.width = `${Math.round(orig.width * s)}px`;
    compareImg.style.height = `${Math.round(orig.height * s)}px`;
  }

  document.getElementById('zoom-label').textContent = zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`;
  emit('layout');
}

function setZoom(z) {
  zoom = z;
  layout();
}

export function zoomIn() {
  const next = ZOOM_STEPS.find((z) => z > scale + 0.001);
  if (next) setZoom(next);
}

export function zoomOut() {
  const prev = [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.001);
  if (prev) setZoom(prev);
}

/** Toggle between "fit to stage" and actual pixels */
export function toggleZoom() {
  setZoom(zoom === 'fit' ? 1 : 'fit');
}

// ---- Compare ----

export function isComparing() {
  return comparing;
}

export function toggleCompare() {
  setCompare(!comparing);
}

function setCompare(on) {
  const stage = document.getElementById('stage');
  const btn = document.getElementById('compare-btn');
  comparing = on && getOriginal() !== null;

  if (compareUrl) URL.revokeObjectURL(compareUrl);
  compareUrl = null;
  if (comparing) {
    compareUrl = URL.createObjectURL(new Blob([getOriginal().gif], { type: 'image/gif' }));
    compareImg.src = compareUrl;
  } else {
    compareImg.removeAttribute('src');
  }

  comparePane.classList.toggle('hidden', !comparing);
  document.getElementById('edited-badge').classList.toggle('hidden', !comparing);
  // Side by side on wide stages, stacked on narrow ones
  stage.classList.toggle('md:grid-cols-2', comparing);
  stage.classList.toggle('max-md:grid-rows-2', comparing);
  btn.setAttribute('aria-pressed', String(comparing));
  btn.classList.toggle('btn-soft', comparing);
  btn.classList.toggle('btn-ghost', !comparing);
  requestAnimationFrame(layout);
}

// ---- Controls UI ----

function renderControls() {
  const playBtn = document.getElementById('pc-play');
  playBtn.innerHTML = icon(playing ? 'pause' : 'play', 'w-4 h-4');
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');

  const scrub = document.getElementById('pc-scrub');
  scrub.max = String(Math.max(0, count - 1));
  scrub.value = String(index);
  document.getElementById('pc-frame').textContent = count ? `${index + 1} / ${count}` : '';
}
