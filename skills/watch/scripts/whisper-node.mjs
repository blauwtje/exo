import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { toolReason } from './run-tool.mjs';
import { cachePath, ensureModel } from './whisper-model.mjs';
import { detectSpeech, windowOf } from './whisper-vad.mjs';

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
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageFolder(prefix), 'package.json'), 'utf8'));
    return manifest.version === VERSION;
  } catch {
    return false;
  }
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
