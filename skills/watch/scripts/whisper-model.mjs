import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cacheRoot } from './ytdlp-binary.mjs';

export const MODEL = {
  file: 'ggml-base-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  size: 59707625,
  sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
};

export function cachePath(options, ...parts) {
  return path.join(cacheRoot(options.env ?? process.env, options.home ?? os.homedir()), ...parts);
}

export function failureText(error, ms) {
  if (error.name === 'TimeoutError') return `no answer within ${ms / 1000} s`;
  return error.cause?.code ?? error.message;
}

async function sha256Of(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(pin, target, options) {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const response = await fetchFn(pin.url, { signal: AbortSignal.timeout(options.transcribeMs) });
  if (!response.ok) throw new Error(`${pin.url} answered ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target));
}

async function check(file, pin) {
  const { size } = fs.statSync(file);
  if (size !== pin.size) throw new Error(`${pin.file} has ${size} bytes, expected ${pin.size}`);
  if ((await sha256Of(file)) !== pin.sha256) throw new Error(`${pin.file} differs from its pinned checksum`);
}

function isCached(file, pin) {
  try {
    return fs.statSync(file).size === pin.size;
  } catch {
    return false;
  }
}

export async function ensureFile(pin, options, name) {
  const target = cachePath(options, 'models', pin.file);
  if (isCached(target, pin)) return { model: target };
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await download(pin, temp, options);
    await check(temp, pin);
    fs.renameSync(temp, target);
    return { model: target };
  } catch (error) {
    fs.rmSync(temp, { force: true });
    return { failure: `downloading the ${name} failed: ${failureText(error, options.transcribeMs)}` };
  }
}

export function ensureModel(options) {
  return ensureFile(options.modelPin ?? MODEL, options, 'whisper model');
}
