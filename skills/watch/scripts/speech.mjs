import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { orWhenAbsent } from '#absent-path';
import { parseLine } from '#basics';
import { runTool, ToolFailure, toolReason } from './run-tool.mjs';
import { ensureModel, cachePath, ensureFile } from './whisper-model.mjs';
import { isExecutable } from './ytdlp-binary.mjs';

const AUDIO_SELECTOR = 'bestaudio[format_note*=original]/bestaudio[ext=mp3]/bestaudio[ext=wav]/bestaudio[ext=flac]/bestaudio/best';
const READABLE = new Set(['.mp3', '.wav', '.flac']);
const ENGINE_NAMES = { 'whisper-cli': 'whisper.cpp', whisper: 'whisper', 'whisper-node': 'whisper.node' };

let engineQueue = Promise.resolve();

function onPath(tool, env) {
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => isExecutable(path.join(folder, tool)));
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
    if (!(error instanceof ToolFailure)) throw error;
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

const PACKAGE = '@fugood/whisper.node';
const VERSION = '1.1.3';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const WORKER = `
const [entry, model] = process.argv.slice(1);
const { initWhisper } = require(entry);
let loading;
process.on('disconnect', () => process.exit(0));
process.on('message', async ({ file, settings }) => {
  try {
    loading ??= initWhisper({ filePath: model });
    const context = await loading;
    const { language, segments } = await context.transcribeFile(file, settings).promise;
    process.send({ language, segments });
  } catch (error) {
    process.send({ error: error.message });
  }
});
`;
const workers = new Map();

function packageFolder(prefix) {
  return path.join(prefix, 'node_modules', PACKAGE);
}

function isInstalled(prefix) {
  const text = orWhenAbsent(() => fs.readFileSync(path.join(packageFolder(prefix), 'package.json'), 'utf8'), null);
  return parseLine(text)?.version === VERSION;
}

async function install(prefix, options) {
  if (isInstalled(prefix)) return {};
  const args = ['install', '--prefix', prefix, `${PACKAGE}@${VERSION}`, '--no-audit', '--no-fund', '--loglevel=error'];
  const run = await options.runTool(NPM, args, options.transcribeMs);
  if (!run.error) return {};
  return { failure: `installing whisper.node failed: ${toolReason(run, options)}` };
}

function startWorker(prefix, model) {
  const child = spawn(process.execPath, ['-e', WORKER, packageFolder(prefix), model], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  child.unref();
  child.channel?.unref();
  child.once('exit', () => {
    if (workers.get(model) === child) workers.delete(model);
  });
  return child;
}

function workerFor(prefix, model) {
  if (!workers.has(model)) workers.set(model, startWorker(prefix, model));
  return workers.get(model);
}

function retire(model) {
  workers.get(model)?.kill('SIGKILL');
  workers.delete(model);
}

function ask(child, request, options) {
  return new Promise((resolve) => {
    const finish = (reply) => {
      clearTimeout(timer);
      child.off('message', finish).off('exit', crashed).off('error', failed);
      resolve(reply);
    };
    const crashed = (code, signal) => finish({ error: `it exited with ${signal ?? `code ${code}`}` });
    const failed = (error) => finish({ error: error.message });
    const timer = setTimeout(() => finish({ error: `did not finish within ${options.transcribeMs / 1000} s` }), options.transcribeMs);
    child.on('message', finish).on('exit', crashed).on('error', failed);
    child.send(request);
  });
}

async function recognise({ prefix, model, file, language, window }, options) {
  const settings = { language: language || 'auto' };
  if (window) Object.assign(settings, { offset: window.offset, duration: window.duration });
  const heard = await ask(workerFor(prefix, model), { file, settings }, options);
  if (heard.error) {
    retire(model);
    return { failure: `whisper.node failed: ${heard.error}` };
  }
  if (!Array.isArray(heard.segments)) return { failure: 'whisper.node failed: it printed no segments' };
  return { segments: heard.segments, language: heard.language };
}

function timestamp(milliseconds) {
  const total = Math.round(milliseconds);
  const pad = (value, width) => String(value).padStart(width, '0');
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor(total / 60000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(total % 1000, 3)}`;
}

export function vttOf(segments) {
  const cues = segments
    .map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ').trim() }))
    .filter((segment) => segment.text !== '')
    .map((segment) => `${timestamp(segment.t0)} --> ${timestamp(segment.t1)}\n${segment.text}\n`);
  return `WEBVTT\n\n${cues.join('\n')}`;
}

async function speechWindow(prefix, file, options) {
  const detected = await detectSpeech({ entry: packageFolder(prefix), file }, options);
  if (detected.failure) return {};
  if (detected.spans.length === 0) return { silent: true };
  return { window: windowOf(detected.spans) };
}

export async function transcribeWithNode(file, language, options) {
  const prefix = cachePath(options, 'npm', 'whisper');
  const installed = await install(prefix, options);
  if (installed.failure) return installed;
  const heard = await speechWindow(prefix, file, options);
  if (heard.silent) return { segments: [] };
  const modelled = await ensureModel(options);
  if (modelled.failure) return modelled;
  return recognise({ prefix, model: modelled.model, file, language, window: heard.window }, options);
}

export const VAD_MODEL = {
  file: 'ggml-silero-v6.2.0.bin',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
  size: 885098,
  sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
};

const CENTISECONDS_TO_MS = 10;
const CHILD = `
const [entry, model, file] = process.argv.slice(1);
const { initWhisperVad } = require(entry);
const detect = async () => {
  const context = await initWhisperVad({ filePath: model, useGpu: false });
  const spans = await context.detectSpeechFile(file, {});
  await context.release();
  process.stdout.write(JSON.stringify(spans) + '\\n', () => process.exit(0));
};
detect().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;

function lastJson(stdout) {
  return parseLine(stdout.trim().split('\n').pop());
}

function isSpan(span) {
  return Number.isFinite(span?.t0) && Number.isFinite(span?.t1);
}

export function windowOf(spans) {
  const offset = Math.round(Math.min(...spans.map((span) => span.t0)) * CENTISECONDS_TO_MS);
  const end = Math.round(Math.max(...spans.map((span) => span.t1)) * CENTISECONDS_TO_MS);
  return { offset, duration: end - offset };
}

export async function detectSpeech({ entry, file }, options) {
  const modelled = await ensureFile(options.vadPin ?? VAD_MODEL, options, 'voice activity model');
  if (modelled.failure) return modelled;
  const run = await options.runTool(process.execPath, ['-e', CHILD, entry, modelled.model, file], options.transcribeMs);
  if (run.error) return { failure: `voice activity detection failed: ${toolReason(run, options)}` };
  const spans = lastJson(run.stdout);
  if (!Array.isArray(spans) || !spans.every(isSpan)) return { failure: 'voice activity detection failed: it printed no spans' };
  return { spans };
}
