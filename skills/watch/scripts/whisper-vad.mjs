import process from 'node:process';
import { toolReason } from './run-tool.mjs';
import { ensureFile } from './whisper-model.mjs';

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
  try {
    return JSON.parse(stdout.trim().split('\n').pop());
  } catch {
    return null;
  }
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
