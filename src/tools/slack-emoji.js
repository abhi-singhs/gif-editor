import { writeFile, readFile, runFFmpeg, deleteFile, initFFmpeg } from '../ffmpeg/engine.js';
import { slackEmojiCmds } from '../ffmpeg/commands.js';

const TARGET_SIZE = 128 * 1024; // 128 KB

const COLOR_STEPS = [256, 128, 64, 32];
const FPS_STEPS = [20, 15, 10, 8, 5];
const SIZE_STEPS = [128, 96, 64];

/**
 * Iteratively compress a GIF to fit Slack emoji requirements:
 * square, ≤128KB. Tries progressively more aggressive settings.
 */
export async function slackEmojiExport(gifData) {
  await initFFmpeg();

  for (const size of SIZE_STEPS) {
    for (const colors of COLOR_STEPS) {
      for (const fps of FPS_STEPS) {
        const result = await runTwoPass(gifData, { size, colors, fps });
        if (result.byteLength <= TARGET_SIZE) {
          return result;
        }
      }
    }
  }

  // Return the most aggressively compressed version even if over target
  const lastSize = SIZE_STEPS[SIZE_STEPS.length - 1];
  const lastColors = COLOR_STEPS[COLOR_STEPS.length - 1];
  const lastFps = FPS_STEPS[FPS_STEPS.length - 1];
  return await runTwoPass(gifData, { size: lastSize, colors: lastColors, fps: lastFps });
}

async function runTwoPass(gifData, opts) {
  await writeFile('input.gif', gifData);
  const [pass1, pass2] = slackEmojiCmds('input.gif', 'output.gif', opts);
  await runFFmpeg(pass1);
  await runFFmpeg(pass2);
  const result = await readFile('output.gif');
  await deleteFile('input.gif');
  await deleteFile('output.gif');
  await deleteFile('palette.png');
  return result;
}
