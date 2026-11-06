import fs from 'node:fs';
import path from 'node:path';
import { extractFrames } from './decoder.mjs';
import { runYtDlpWithRuntime, ytDlpReason } from './ytdlp.mjs';

const FEW_WORDS = 15;
const SOURCE_FOLDER = 'video-source';

async function downloadVideo(url, folder, options) {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const runYtDlp = options.runYtDlp ?? runYtDlpWithRuntime;
  const args = ['-f', 'bv*/b', '-S', 'res:480', '--no-playlist', '--playlist-items', '1', '--no-warnings', '-P', folder, '-o', 'video.%(ext)s', '--', url];
  const run = await runYtDlp(args, options.ytDlpMs);
  const name = fs.readdirSync(folder).find((file) => file.startsWith('video.'));
  if (name && !run.error) return path.join(folder, name);
  throw new Error(`video download failed: ${ytDlpReason(run, options)}`);
}

async function grabFrames({ url, dir, duration }, options) {
  const folder = path.join(dir, SOURCE_FOLDER);
  try {
    const video = await downloadVideo(url, folder, options);
    return await extractFrames(video, dir, duration, options);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

export async function withKeyframes(result, url, options) {
  const quiet = result.transcript && result.words < FEW_WORDS && result.duration > 0;
  if (!quiet) return result;
  try {
    const frames = await grabFrames({ url, dir: result.dir, duration: result.duration }, options);
    return { ...result, line: `${result.line} frames=${frames} (${fs.readdirSync(frames).length} files)` };
  } catch {
    return result;
  }
}
