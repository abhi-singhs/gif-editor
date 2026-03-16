/** FFmpeg command builders — each returns an array of CLI args */

export function resizeCmd(inputFile, outputFile, width, height) {
  return [
    '-i', inputFile,
    '-vf', `scale=${width}:${height}:flags=lanczos`,
    '-y', outputFile,
  ];
}

export function cropCmd(inputFile, outputFile, w, h, x, y) {
  return [
    '-i', inputFile,
    '-vf', `crop=${w}:${h}:${x}:${y}`,
    '-y', outputFile,
  ];
}

/**
 * Compress via two-pass palette optimization.
 * Returns [pass1Args, pass2Args] — caller must run both sequentially.
 */
export function compressCmds(inputFile, outputFile, { colors = 256, fps = null } = {}) {
  const filters = [];
  if (fps) filters.push(`fps=${fps}`);

  const pass1Filters = [...filters, `palettegen=max_colors=${colors}:stats_mode=diff`].join(',');
  const pass2Filters = [...filters, `paletteuse=dither=bayer:bayer_scale=5`].join(',');

  const pass1 = ['-i', inputFile, '-vf', pass1Filters, '-y', 'palette.png'];
  const pass2 = ['-i', inputFile, '-i', 'palette.png', '-lavfi', pass2Filters, '-y', outputFile];
  return [pass1, pass2];
}

export function speedCmd(inputFile, outputFile, speed) {
  const pts = 1 / speed;
  return [
    '-i', inputFile,
    '-vf', `setpts=${pts.toFixed(4)}*PTS`,
    '-y', outputFile,
  ];
}

export function trimCmd(inputFile, outputFile, startTime, duration) {
  const args = ['-i', inputFile];
  if (startTime > 0) args.push('-ss', String(startTime));
  if (duration > 0) args.push('-t', String(duration));
  args.push('-y', outputFile);
  return args;
}

export function reverseCmd(inputFile, outputFile) {
  return [
    '-i', inputFile,
    '-vf', 'reverse',
    '-y', outputFile,
  ];
}

export function filterCmd(inputFile, outputFile, { brightness = 0, contrast = 1, saturation = 1, grayscale = false }) {
  const filters = [];
  if (grayscale) {
    filters.push('hue=s=0');
  }
  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
  }
  if (filters.length === 0) filters.push('null');
  return [
    '-i', inputFile,
    '-vf', filters.join(','),
    '-y', outputFile,
  ];
}

export function extractFramesCmd(inputFile, outputPattern) {
  return [
    '-i', inputFile,
    '-vsync', '0',
    outputPattern,
  ];
}

export function assembleFramesCmd(inputPattern, outputFile, fps = 10) {
  return [
    '-framerate', String(fps),
    '-i', inputPattern,
    '-y', outputFile,
  ];
}

/**
 * Combined resize + compress for Slack emoji preset.
 * Returns [pass1Args, pass2Args] — caller must run both sequentially.
 */
export function slackEmojiCmds(inputFile, outputFile, { size = 128, colors = 256, fps = 15 }) {
  const preprocess = [
    `crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2`,
    `scale=${size}:${size}:flags=lanczos`,
  ];
  if (fps) preprocess.push(`fps=${fps}`);

  const pass1Filters = [...preprocess, `palettegen=max_colors=${colors}:stats_mode=diff`].join(',');
  const pass2Filters = [...preprocess, `paletteuse=dither=bayer:bayer_scale=5`].join(',');

  const pass1 = ['-i', inputFile, '-vf', pass1Filters, '-y', 'palette.png'];
  const pass2 = ['-i', inputFile, '-i', 'palette.png', '-lavfi', pass2Filters, '-y', outputFile];
  return [pass1, pass2];
}
