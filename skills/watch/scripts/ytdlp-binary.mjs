import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const SUMS = 'SHA2-256SUMS';
const ASSETS = {
  darwin: { arm64: 'yt-dlp_macos', x64: 'yt-dlp_macos' },
  linux: { x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux_aarch64' },
  win32: { x64: 'yt-dlp.exe', arm64: 'yt-dlp.exe', ia32: 'yt-dlp.exe' },
};
const provisioning = new Map();

export function assetFor(platform, arch) {
  return ASSETS[platform]?.[arch] ?? null;
}

function binaryName(platform) {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export function cacheRoot(env, home) {
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  return path.join(home, '.cache', 'exo');
}

function cacheDirOf(env, home) {
  return path.join(cacheRoot(env, home), 'bin');
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(name, env) {
  const folders = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return folders.some((folder) => isExecutable(path.join(folder, name)));
}

function checksumOf(sums, asset) {
  const rows = sums.split('\n').map((text) => text.trim().split(/\s+/));
  const row = rows.find(([, name]) => name?.replace(/^\*/, '') === asset);
  return row?.[0]?.toLowerCase() ?? null;
}

function failureText(error, fetchMs) {
  if (error.name === 'TimeoutError') return `no answer within ${fetchMs / 1000} s`;
  return error.cause?.code ?? error.message;
}

async function download(url, { fetchFn, fetchMs }) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(fetchMs) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function verify(binary, sums, asset) {
  const expected = checksumOf(sums, asset);
  if (!expected) throw new Error(`${SUMS} lists no ${asset}`);
  const actual = createHash('sha256').update(binary).digest('hex');
  if (actual !== expected) throw new Error(`checksum mismatch for ${asset}`);
}

function writeAtomically(target, binary) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, binary);
    fs.chmodSync(temp, 0o755);
    fs.renameSync(temp, target);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

async function provision(asset, target, transport) {
  try {
    const sums = (await download(`${RELEASE}/${SUMS}`, transport)).toString('utf8');
    const binary = await download(`${RELEASE}/${asset}`, transport);
    verify(binary, sums, asset);
    writeAtomically(target, binary);
    return { command: target };
  } catch (error) {
    return { command: null, reason: failureText(error, transport.fetchMs) };
  }
}

function provisionOnce(asset, target, transport) {
  if (!provisioning.has(target)) provisioning.set(target, provision(asset, target, transport));
  return provisioning.get(target);
}

export async function resolveYtDlp(options = {}) {
  const { env = process.env, platform = process.platform, arch = process.arch, fetchFn = globalThis.fetch, fetchMs, home = os.homedir() } = options;
  if (env.EXO_YTDLP) return { command: env.EXO_YTDLP };
  const name = binaryName(platform);
  if (findOnPath(name, env)) return { command: 'yt-dlp' };
  const asset = assetFor(platform, arch);
  if (!asset) return { command: null };
  const target = path.join(cacheDirOf(env, home), name);
  if (isExecutable(target)) return { command: target };
  return provisionOnce(asset, target, { fetchFn, fetchMs });
}
