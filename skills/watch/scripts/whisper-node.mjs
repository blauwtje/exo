import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { toolReason } from './run-tool.mjs';
import { cachePath, ensureModel } from './whisper-model.mjs';
import { detectSpeech, windowOf } from './whisper-vad.mjs';

const PACKAGE = '@fugood/whisper.node';
const VERSION = '1.1.3';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const CHILD = `
const [entry, model, file, language, offset, duration] = process.argv.slice(1);
const { initWhisper } = require(entry);
const transcribe = async () => {
  const context = await initWhisper({ filePath: model });
  const settings = { language: language || 'auto' };
  if (duration) Object.assign(settings, { offset: Number(offset), duration: Number(duration) });
  const { promise } = context.transcribeFile(file, settings);
  const { language: detected, segments } = await promise;
  await context.release();
  const line = JSON.stringify({ language: detected, segments }) + '\\n';
  process.stdout.write(line, () => process.exit(0));
};
transcribe().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`;

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

function lastJson(stdout) {
  const line = stdout.trim().split('\n').pop();
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function recognise({ prefix, model, file, language, window }, options) {
  const args = ['-e', CHILD, packageFolder(prefix), model, file, language ?? '', String(window?.offset ?? ''), String(window?.duration ?? '')];
  const run = await options.runTool(process.execPath, args, options.transcribeMs);
  if (run.error) return { failure: `whisper.node failed: ${toolReason(run, options)}` };
  const heard = lastJson(run.stdout);
  if (!Array.isArray(heard?.segments)) return { failure: 'whisper.node failed: it printed no segments' };
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
