/** Lossless (optionally lossy) GIF optimisation with gifsicle, run after FFmpeg encodes */

/** @type {Promise<any>|null} the package is ~340 KB, so load it on first use */
let gifsiclePromise = null;

function loadGifsicle() {
  gifsiclePromise ??= import('gifsicle-wasm-browser')
    .then((mod) => mod.default)
    .catch((err) => {
      gifsiclePromise = null;
      throw err;
    });
  return gifsiclePromise;
}

/**
 * Shrink a GIF with gifsicle -O2 (and --lossy=N when lossy > 0).
 * Never fails and never grows the file: on error, or if gifsicle didn't help,
 * the input comes back unchanged.
 * @param {Uint8Array} bytes
 * @param {{lossy?: number}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function optimizeGif(bytes, { lossy = 0 } = {}) {
  const start = performance.now();
  try {
    const gifsicle = await loadGifsicle();
    const flags = ['-O2', lossy > 0 ? `--lossy=${Math.round(lossy)}` : ''].filter(Boolean).join(' ');
    const [file] = await gifsicle.run({
      input: [{ file: new Blob([bytes], { type: 'image/gif' }), name: 'in.gif' }],
      command: [`${flags} in.gif -o /out/out.gif`],
    });
    const out = new Uint8Array(await file.arrayBuffer());
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    const ms = (performance.now() - start).toFixed(0);
    if (out.byteLength >= bytes.byteLength) {
      console.log(`[Gifsicle] ${flags}: no gain (${kb(bytes.byteLength)} → ${kb(out.byteLength)}) in ${ms}ms, keeping input`);
      return bytes;
    }
    console.log(`[Gifsicle] ${flags}: ${kb(bytes.byteLength)} → ${kb(out.byteLength)} in ${ms}ms`);
    return out;
  } catch (err) {
    console.warn('[Gifsicle] Optimisation skipped:', err);
    return bytes;
  }
}
