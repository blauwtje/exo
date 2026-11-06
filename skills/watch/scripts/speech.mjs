import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runTool, toolReason } from './run-tool.mjs';
import { ensureModel } from './whisper-model.mjs';
import { transcribeWithNode, vttOf } from './whisper-node.mjs';

const AUDIO_SELECTOR = 'bestaudio[ext=mp3]/bestaudio[ext=wav]/bestaudio[ext=flac]/bestaudio/best';
const READABLE = new Set(['.mp3', '.wav', '.flac']);
const ENGINE_NAMES = { 'whisper-cli': 'whisper.cpp', whisper: 'whisper', 'whisper-node': 'whisper.node' };

let engineQueue = Promise.resolve();

function onPath(tool, env) {
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => {
    try {
      fs.accessSync(path.join(folder, tool), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function engineOf(options) {
  const env = options.env ?? process.env;
  return ['whisper-cli', 'whisper'].find((tool) => onPath(tool, env)) ?? 'whisper-node';
}

function languageOf(options) {
  return options.lang?.split('-')[0].toLowerCase();
}

async function modelOf(options) {
  if (options.model && fs.existsSync(options.model)) return { model: options.model };
  return ensureModel(options);
}

function engineArguments({ file, dir, model }, options) {
  const language = languageOf(options);
  if (options.engine === 'whisper-cli') {
    return ['-m', model, '-f', file, '-l', language ?? 'auto', '-ovtt', '-of', path.join(dir, 'raw')];
  }
  const spoken = language ? ['--language', language] : [];
  const named = options.model ? ['--model', options.model] : [];
  return [file, '--output_format', 'vtt', '--output_dir', dir, ...spoken, ...named];
}

async function downloadAudio(url, dir, options) {
  removeAudio(dir);
  const args = ['-f', AUDIO_SELECTOR, '--no-playlist', '--playlist-items', '1', '--no-warnings', '-P', dir, '-o', 'audio.%(ext)s', '--', url];
  const run = await options.runYtDlp(args, options.ytDlpMs);
  const name = fs.readdirSync(dir).find((file) => file.startsWith('audio.'));
  if (name && !run.error) return { audio: path.join(dir, name) };
  return { failure: `audio download failed: ${options.ytDlpReason(run, options)}` };
}

async function readableAudio(audio, options) {
  if (READABLE.has(path.extname(audio).toLowerCase())) return { file: audio };
  try {
    const toWav = options.toWav ?? (await import('./decoder.mjs')).toWav;
    return { file: await toWav(audio, options) };
  } catch (error) {
    return { failure: `converting the audio failed: ${error.message}` };
  }
}

async function withCommand(file, dir, options) {
  const { engine } = options;
  const modelled = engine === 'whisper-cli' ? await modelOf(options) : {};
  if (modelled.failure) return modelled;
  const raw = path.join(dir, 'raw.vtt');
  fs.rmSync(raw, { force: true });
  const run = await options.runTool(engine, engineArguments({ file, dir, model: modelled.model }, options), options.transcribeMs);
  if (run.error) return { failure: `${engine} failed: ${toolReason(run, options)}` };
  const whisperOutput = path.join(dir, 'audio.vtt');
  if (fs.existsSync(whisperOutput)) fs.renameSync(whisperOutput, raw);
  if (!fs.existsSync(raw)) return { failure: `${engine} failed: it wrote no captions` };
  return { vtt: raw };
}

async function withNode(file, dir, options) {
  const heard = await transcribeWithNode(file, languageOf(options), options);
  if (heard.failure) return heard;
  const raw = path.join(dir, 'raw.vtt');
  fs.writeFileSync(raw, vttOf(heard.segments));
  return { vtt: raw, language: heard.language };
}

async function listen(audio, dir, options) {
  const readable = await readableAudio(audio, options);
  if (readable.failure) return readable;
  try {
    const hear = options.engine === 'whisper-node' ? withNode : withCommand;
    return await hear(readable.file, dir, options);
  } finally {
    if (readable.file !== audio) fs.rmSync(readable.file, { force: true });
  }
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
  const missing = await options.ytDlpNeed();
  if (missing) return { missing };
  fs.mkdirSync(dir, { recursive: true });
  const running = { runTool, ...options, engine: engineOf(options) };
  try {
    const downloaded = await downloadAudio(url, dir, running);
    if (downloaded.failure) return downloaded;
    const done = await afterEarlierVideos(() => listen(downloaded.audio, dir, running));
    return done.failure ? done : { ...done, engine: ENGINE_NAMES[running.engine] };
  } finally {
    removeAudio(dir);
  }
}
