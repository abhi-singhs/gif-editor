/** FFmpeg command builders — each returns an array of CLI args, or an array of passes */

/**
 * Two-pass palette encode: palettegen → palette.png, then paletteuse → output.
 * Every edit that re-encodes a GIF goes through this: without a generated palette
 * ffmpeg falls back to a fixed, dithered 3-3-2 palette that drops transparency and
 * wrecks LZW + inter-frame compression (a reverse could grow a file 8×).
 *
 * `filters` is the edit chain applied before quantising. `paletteFilters` defaults
 * to it; pass a cheaper chain when the edit only reorders or retimes frames, since
 * palette stats don't depend on frame order.
 * Returns [pass1Args, pass2Args] — caller must run both sequentially.
 */
function paletteCmds(inputFile, outputFile, { filters = [], paletteFilters = filters, colors = 256 } = {}) {
  const pass1Filters = [...paletteFilters, `palettegen=max_colors=${colors}:stats_mode=diff`].join(',');
  const chain = filters.length ? filters.join(',') : 'null';
  // diff_mode=rectangle only re-quantises the changed region, so static areas stay
  // byte-identical between frames and the encoder can skip them
  const pass2Filters = `[0:v]${chain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;

  const pass1 = ['-i', inputFile, '-vf', pass1Filters, '-y', 'palette.png'];
  const pass2 = ['-i', inputFile, '-i', 'palette.png', '-lavfi', pass2Filters, '-y', outputFile];
  return [pass1, pass2];
}

export function resizeCmds(inputFile, outputFile, width, height) {
  return paletteCmds(inputFile, outputFile, { filters: [`scale=${width}:${height}:flags=lanczos`] });
}

export function cropCmds(inputFile, outputFile, w, h, x, y) {
  return paletteCmds(inputFile, outputFile, { filters: [`crop=${w}:${h}:${x}:${y}`] });
}

export function compressCmds(inputFile, outputFile, { colors = 256, fps = null } = {}) {
  return paletteCmds(inputFile, outputFile, { filters: fps ? [`fps=${fps}`] : [], colors });
}

export function speedCmds(inputFile, outputFile, speed) {
  const pts = 1 / speed;
  return paletteCmds(inputFile, outputFile, { filters: [`setpts=${pts.toFixed(4)}*PTS`], paletteFilters: [] });
}

export function trimCmds(inputFile, outputFile, startTime, duration) {
  // A trim filter (not -ss/-t) so the palette is built from the kept frames only
  const trim = ['start=' + startTime];
  if (duration > 0) trim.push('duration=' + duration);
  return paletteCmds(inputFile, outputFile, { filters: [`trim=${trim.join(':')}`, 'setpts=PTS-STARTPTS'] });
}

export function reverseCmds(inputFile, outputFile) {
  // Pass 1 skips the reverse: it buffers every frame and doesn't change the palette
  return paletteCmds(inputFile, outputFile, { filters: ['reverse'], paletteFilters: [] });
}

export function filterCmds(inputFile, outputFile, { brightness = 0, contrast = 1, saturation = 1, grayscale = false }) {
  const filters = [];
  if (grayscale) {
    filters.push('hue=s=0');
  }
  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
  }
  return paletteCmds(inputFile, outputFile, { filters });
}

export function extractFramesCmd(inputFile, outputPattern) {
  return [
    '-i', inputFile,
    '-vsync', '0',
    outputPattern,
  ];
}

/** Assemble numbered PNG frames into a GIF with an optimized single-pass palette */
export function assembleFramesCmd(inputPattern, outputFile, fps = 10) {
  return [
    '-framerate', String(fps),
    '-i', inputPattern,
    '-filter_complex', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-y', outputFile,
  ];
}

/**
 * Combined resize + compress for Slack emoji preset.
 * Returns [pass1Args, pass2Args] — caller must run both sequentially.
 */
export function slackEmojiCmds(inputFile, outputFile, { size = 128, colors = 256, fps = 15 }) {
  const filters = [
    `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2`,
    `scale=${size}:${size}:flags=lanczos`,
  ];
  if (fps) filters.push(`fps=${fps}`);
  return paletteCmds(inputFile, outputFile, { filters, colors });
}
