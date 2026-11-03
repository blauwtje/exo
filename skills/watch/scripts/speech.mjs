import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MODEL_SOURCE = 'huggingface.co/ggerganov/whisper.cpp';
const HINTS = {
  'yt-dlp': "'brew install yt-dlp' or 'pipx install yt-dlp'",
  ffmpeg: "'brew install ffmpeg'",
  'whisper-cli': `'brew install whisper-cpp' plus a ggml model from ${MODEL_SOURCE} passed as --model`,
  whisper: `'pipx install openai-whisper', or 'brew install whisper-cpp' plus a ggml model from ${MODEL_SOURCE} passed as --model`,
};
const ENGINE_NAMES = { 'whisper-cli': 'whisper.cpp', whisper: 'whisper' };

let engineQueue = Promise.resolve();

function onPath(tool) {
  const folders = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => {
    try {
      fs.accessSync(path.join(folder, tool), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function runTool(command, args, timeout) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

function toolReason(run, options) {
  if (run.error?.killed) return `did not finish within ${options.transcribeMs / 1000} s`;
  const lastLine = run.stderr.trim().split('\n').pop();
  return lastLine || run.error.message;
}

function engineOf(options) {
  const useCpp = Boolean(options.model) && fs.existsSync(options.model);
  return useCpp ? 'whisper-cli' : 'whisper';
}

function missingTool(options) {
  const tools = ['yt-dlp', 'ffmpeg', engineOf(options)];
  const tool = tools.find((name) => !onPath(name));
  if (!tool) return null;
  return `${tool} on PATH; install it with ${HINTS[tool]}`;
}

function languageOf(options) {
  return options.lang?.split('-')[0].toLowerCase();
}

function engineArguments(wav, dir, options) {
  const language = languageOf(options);
  if (options.engine === 'whisper-cli') {
    return ['-m', options.model, '-f', wav, '-l', language ?? 'auto', '-ovtt', '-of', path.join(dir, 'raw')];
  }
  const spoken = language ? ['--language', language] : [];
  const model = options.model ? ['--model', options.model] : [];
  return [wav, '--output_format', 'vtt', '--output_dir', dir, ...spoken, ...model];
}

async function downloadAudio(url, dir, options) {
  removeAudio(dir);
  const args = ['-f', 'bestaudio/best', '--no-playlist', '--playlist-items', '1', '--no-warnings', '-P', dir, '-o', 'audio.%(ext)s', '--', url];
  const run = await options.runYtDlp(args, options.ytDlpMs);
  const name = fs.readdirSync(dir).find((file) => file.startsWith('audio.'));
  if (name && !run.error) return { audio: path.join(dir, name) };
  return { failure: `audio download failed: ${options.ytDlpReason(run, options)}` };
}

async function convertAudio(audio, wav, options) {
  const args = ['-nostdin', '-y', '-i', audio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav];
  const run = await runTool('ffmpeg', args, options.transcribeMs);
  if (!run.error) return {};
  return { failure: `ffmpeg failed: ${toolReason(run, options)}` };
}

async function recognise(wav, dir, options) {
  const { engine } = options;
  const raw = path.join(dir, 'raw.vtt');
  fs.rmSync(raw, { force: true });
  const run = await runTool(engine, engineArguments(wav, dir, options), options.transcribeMs);
  if (run.error) return { failure: `${engine} failed: ${toolReason(run, options)}` };
  const whisperOutput = path.join(dir, 'audio.vtt');
  if (fs.existsSync(whisperOutput)) fs.renameSync(whisperOutput, raw);
  if (!fs.existsSync(raw)) return { failure: `${engine} failed: it wrote no captions` };
  return { vtt: raw };
}

async function convertAndRecognise(audio, dir, options) {
  const wav = path.join(dir, 'audio.wav');
  const converted = await convertAudio(audio, wav, options);
  if (converted.failure) return converted;
  return recognise(wav, dir, options);
}

function afterEarlierVideos(work) {
  const turn = engineQueue.then(work);
  engineQueue = turn.catch(() => {});
  return turn;
}

function removeAudio(dir) {
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith('audio.')) fs.rmSync(path.join(dir, file), { force: true });
  }
}

export async function transcribe(url, dir, options) {
  const missing = missingTool(options);
  if (missing) return { missing };
  fs.mkdirSync(dir, { recursive: true });
  const engine = engineOf(options);
  const running = { ...options, engine };
  try {
    const downloaded = await downloadAudio(url, dir, options);
    if (downloaded.failure) return downloaded;
    const done = await afterEarlierVideos(() => convertAndRecognise(downloaded.audio, dir, running));
    return done.failure ? done : { vtt: done.vtt, engine: ENGINE_NAMES[engine] };
  } finally {
    removeAudio(dir);
  }
}
