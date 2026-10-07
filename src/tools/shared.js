import { getState, setState, subscribe, commit } from '../utils/state.js';
import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg, onProgress } from '../ffmpeg/engine.js';
import { optimizeGif } from '../gifsicle/optimize.js';
import { showToast } from '../components/toast.js';

let jobText = '';

function setJobProgress(ratio, sub = '') {
  const bar = document.getElementById('job-bar');
  const valid = Number.isFinite(ratio) && ratio > 0 && ratio <= 1;
  bar.classList.toggle('progress-indeterminate', !valid);
  bar.style.width = valid ? `${Math.round(ratio * 100)}%` : '';
  document.getElementById('job-sub').textContent = sub;
}

export function showProcessing(text = 'Working…') {
  console.log(`[Processing] Start: ${text}`);
  jobText = text;
  setState({ processing: true });
  document.getElementById('job-overlay').classList.remove('hidden');
  document.getElementById('job-text').textContent = text;
  setJobProgress(null);
}

export function hideProcessing() {
  console.log('[Processing] Done');
  setState({ processing: false });
  onProgress(null);
  document.getElementById('job-overlay').classList.add('hidden');
}

/** While a job waits on the engine, mirror the engine's download progress in the overlay */
export function initJobOverlay() {
  subscribe('engine', (engine) => {
    if (!getState().processing) return;
    if (engine.status === 'loading') {
      document.getElementById('job-text').textContent = 'Warming up the engine…';
      setJobProgress(engine.pct / 100, engine.text);
    } else if (engine.status === 'ready') {
      document.getElementById('job-text').textContent = jobText;
      setJobProgress(null);
    }
  });
}

/**
 * Run an async FFmpeg job behind the stage overlay. Errors become a toast.
 * Returns the job's result, or undefined if it failed or another job was running.
 */
export async function runJob(text, fn) {
  if (getState().processing) return undefined;
  showProcessing(text);
  try {
    await initFFmpeg();
    document.getElementById('job-text').textContent = text;
    return await fn();
  } catch (err) {
    console.error(`[Job] ${text} failed:`, err);
    showToast(`${text.replace(/…$/, '')} failed: ${err?.message || err}`, 'error', 6000);
    return undefined;
  } finally {
    hideProcessing();
  }
}

/**
 * Write `gif` as input.gif, run each FFmpeg pass, and return output.gif's bytes
 * after a gifsicle pass (`optimize` is passed to optimizeGif, e.g. { lossy }).
 * Two-pass commands (palettegen → paletteuse) write palette.png in between.
 */
export async function transformGif(gif, passes, optimize = {}) {
  let out;
  await writeFile('input.gif', gif);
  try {
    for (let i = 0; i < passes.length; i++) {
      onProgress((p) => setJobProgress(
        (i + Math.min(1, Math.max(0, p))) / passes.length,
        passes.length > 1 ? `Pass ${i + 1} of ${passes.length}` : '',
      ));
      await runFFmpeg(passes[i]);
    }
    out = await readFile('output.gif');
  } finally {
    onProgress(null);
    await deleteFile('input.gif');
    await deleteFile('output.gif');
    await deleteFile('palette.png');
  }
  setJobProgress(null, 'Optimising…');
  return optimizeGif(out, optimize);
}

/**
 * The common tool flow: transform the current GIF, commit it to history, toast.
 * `passes` is an array of FFmpeg arg arrays reading input.gif → output.gif;
 * `optimize` is forwarded to the gifsicle pass.
 */
export function applyEdit({ label, busy, passes, optimize, success }) {
  return runJob(busy, async () => {
    const before = getState().currentGif;
    const result = await transformGif(before, passes, optimize);
    commit(label, result);
    showToast(success ? success(result, before) : `${label} applied`, 'success');
    return result;
  });
}
