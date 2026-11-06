import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { cacheRoot } from './ytdlp-binary.mjs';

const SCOPE = '@ffmpeg-installer';
const FRAME_COUNT = 6;
const LONG_SIDE = 640;
const PACKAGES = {
  'darwin-arm64': { version: '4.1.5', integrity: 'sha512-hYqTiP63mXz7wSQfuqfFwfLOfwwFChUedeCVKkBtl/cliaTM7/ePI9bVzfZ2c+dWu3TqCwLDRWNSJ5pqZl8otA==' },
  'darwin-x64': { version: '4.1.0', integrity: 'sha512-Z4EyG3cIFjdhlY8wI9aLUXuH8nVt7E9SlMVZtWvSPnm2sm37/yC2CwjUzyCQbJbySnef1tQwGG2Sx+uWhd9IAw==' },
  'linux-x64': { version: '4.1.0', integrity: 'sha512-Y5BWhGLU/WpQjOArNIgXD3z5mxxdV8c41C+U15nsE5yF8tVcdCGet5zPs5Zy3Ta6bU7haGpIzryutqCGQA/W8A==' },
  'linux-arm64': { version: '4.1.4', integrity: 'sha512-dljEqAOD0oIM6O6DxBW9US/FkvqvQwgJ2lGHOwHDDwu/pX8+V0YsDL1xqHbj1DMX/+nP9rxw7G7gcUvGspSoKg==' },
  'win32-x64': { version: '4.1.0', integrity: 'sha512-Drt5u2vzDnIONf4ZEkKtFlbvwj6rI3kxw1Ck9fpudmtgaZIHD4ucsWB2lCZBXRxJgXR+2IMSti+4rtM4C4rXgg==' },
};
const provisioning = new Map();

function execute(command, args, timeout) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout, shell: command.endsWith('.cmd') }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

function reasonOf(run, timeout) {
  if (run.error?.killed) return `did not finish within ${timeout / 1000} s`;
  const lastLine = String(run.stderr ?? '').trim().split('\n').pop();
  return lastLine || run.error.message;
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(env) {
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => isExecutable(path.join(folder, 'ffmpeg')) || isExecutable(path.join(folder, 'ffmpeg.exe')));
}

function packageFor(platform, arch) {
  const key = `${platform}-${platform === 'win32' ? 'x64' : arch}`;
  const pinned = PACKAGES[key];
  if (!pinned) throw new Error(`no ffmpeg decoder is published for ${platform}-${arch}`);
  return { key, name: `${SCOPE}/${key}`, mapped: key !== `${platform}-${arch}`, ...pinned };
}

function installedBinary(prefix, pkg, platform) {
  return path.join(prefix, 'node_modules', SCOPE, pkg.key, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

function recordedIntegrity(prefix, pkg) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(prefix, 'package-lock.json'), 'utf8'));
    const suffix = `node_modules/${pkg.name}`;
    const key = Object.keys(lock.packages ?? {}).find((entry) => entry.endsWith(suffix));
    return key ? lock.packages[key].integrity ?? null : null;
  } catch {
    return null;
  }
}

function installArguments(prefix, pkg) {
  const forced = pkg.mapped ? ['--force'] : [];
  return ['install', '--prefix', prefix, `${pkg.name}@${pkg.version}`, '--save-exact', '--no-audit', '--no-fund', '--loglevel=error', ...forced];
}

async function provision(prefix, pkg, { platform, run, timeout }) {
  const npm = platform === 'win32' ? 'npm.cmd' : 'npm';
  const ran = await run(npm, installArguments(prefix, pkg), timeout);
  if (ran.error) throw new Error(`installing ${pkg.name} failed: ${reasonOf(ran, timeout)}`);
  if (recordedIntegrity(prefix, pkg) !== pkg.integrity) {
    fs.rmSync(path.join(prefix, 'node_modules', SCOPE), { recursive: true, force: true });
    throw new Error(`${pkg.name}@${pkg.version} does not match its pinned integrity`);
  }
  const binary = installedBinary(prefix, pkg, platform);
  if (!fs.existsSync(binary)) throw new Error(`${pkg.name} holds no ffmpeg binary`);
  fs.chmodSync(binary, 0o755);
  return binary;
}

export async function decoderPath(options = {}) {
  const { env = process.env, platform = process.platform, arch = process.arch, home = os.homedir(), run = execute } = options;
  if (onPath(env)) return 'ffmpeg';
  const pkg = packageFor(platform, arch);
  const prefix = path.join(cacheRoot(env, home), 'npm', 'ffmpeg');
  const binary = installedBinary(prefix, pkg, platform);
  if (isExecutable(binary) && recordedIntegrity(prefix, pkg) === pkg.integrity) return binary;
  if (!provisioning.has(binary)) {
    const timeout = environmentMs('EXO_WATCH_DECODER_MS', DEFAULTS.decoderMs, env);
    const work = provision(prefix, pkg, { platform, run, timeout }).finally(() => provisioning.delete(binary));
    provisioning.set(binary, work);
  }
  return provisioning.get(binary);
}

async function runDecoder(args, options) {
  const { run = execute } = options;
  const timeout = options.transcribeMs ?? DEFAULTS.transcribeMs;
  const command = await decoderPath(options);
  const ran = await run(command, args, timeout);
  if (ran.error) throw new Error(`ffmpeg failed: ${reasonOf(ran, timeout)}`);
}

function wavPathOf(inputPath) {
  const parsed = path.parse(inputPath);
  const wav = path.join(parsed.dir, `${parsed.name}.wav`);
  return wav === inputPath ? path.join(parsed.dir, `${parsed.name}.16k.wav`) : wav;
}

export async function toWav(inputPath, options = {}) {
  const wav = wavPathOf(inputPath);
  await runDecoder(['-nostdin', '-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], options);
  return wav;
}

function frameArguments(videoPath, seconds, target) {
  const fit = `scale=${LONG_SIDE}:${LONG_SIDE}:force_original_aspect_ratio=decrease`;
  return ['-nostdin', '-y', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-vf', fit, '-q:v', '5', target];
}

export async function extractFrames(videoPath, dir, ...[duration, options = {}]) {
  const folder = path.join(dir, 'frames');
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const jobs = Array.from({ length: FRAME_COUNT }, (_, index) => {
    const target = path.join(folder, `${String(index + 1).padStart(2, '0')}.jpg`);
    return runDecoder(frameArguments(videoPath, ((index + 0.5) * duration) / FRAME_COUNT, target), options);
  });
  const settled = await Promise.allSettled(jobs);
  const failed = settled.find((job) => job.status === 'rejected');
  const missing = fs.readdirSync(folder).length !== FRAME_COUNT;
  if (failed || missing) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw failed ? failed.reason : new Error('ffmpeg wrote fewer frames than asked');
  }
  return folder;
}
