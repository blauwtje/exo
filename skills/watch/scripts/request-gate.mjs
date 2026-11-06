import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { environmentDelayMs } from '#script-flags';
import { DEFAULTS } from './defaults.mjs';
import { cacheRoot } from './ytdlp-binary.mjs';

const RATE_LIMITED = /HTTP Error (?:403|429|5\d\d)|Too Many Requests/i;
const GONE = /private video|this video is private|has been removed|removed by|no longer available|video (?:is )?(?:unavailable|not available)|does not exist|HTTP Error (?:404|410)|account (?:has been |is )?(?:terminated|suspended)/i;
const CONTENDED = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);
const MAX_REASON = 160;

function sleepFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settingsOf(options) {
  const env = options.env ?? process.env;
  const spacingMs = options.spacingMs ?? environmentDelayMs('EXO_WATCH_GATE_MS', DEFAULTS.gateMs, env);
  const dir = options.dir ?? path.join(cacheRoot(env, options.home ?? os.homedir()), 'gate');
  return {
    dir,
    spacingMs,
    jitterMs: options.jitterMs ?? (spacingMs === 0 ? 0 : DEFAULTS.gateJitterMs),
    staleMs: options.staleMs ?? DEFAULTS.gateStaleMs,
    pollMs: options.pollMs ?? DEFAULTS.gatePollMs,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? sleepFor,
    random: options.random ?? Math.random,
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(?:www|m)\./, '') || null;
  } catch {
    return null;
  }
}

function tryCreate(lock) {
  try {
    fs.closeSync(fs.openSync(lock, 'wx'));
    return true;
  } catch (error) {
    if (CONTENDED.has(error.code)) return false;
    throw error;
  }
}

function removeIfStale(lock, settings) {
  try {
    if (settings.now() - fs.statSync(lock).mtimeMs > settings.staleMs + settings.spacingMs + settings.jitterMs) fs.rmSync(lock, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function acquire(lock, settings) {
  while (!tryCreate(lock)) {
    removeIfStale(lock, settings);
    if (!fs.existsSync(lock)) continue;
    await settings.sleep(settings.pollMs);
  }
  return () => fs.rmSync(lock, { force: true });
}

function lastRequest(file) {
  try {
    const stamp = Number(fs.readFileSync(file, 'utf8'));
    return Number.isFinite(stamp) ? stamp : 0;
  } catch {
    return 0;
  }
}

function waitFor(last, settings) {
  const window = settings.spacingMs + settings.random() * settings.jitterMs;
  const wait = last + window - settings.now();
  return Math.min(Math.max(wait, 0), settings.spacingMs + settings.jitterMs);
}

export async function gateRequest(url, options = {}) {
  const host = hostOf(url);
  if (!host) return;
  const settings = settingsOf(options);
  fs.mkdirSync(settings.dir, { recursive: true });
  const release = await acquire(path.join(settings.dir, `${host}.lock`), settings);
  try {
    const stamp = path.join(settings.dir, `${host}.last`);
    const wait = waitFor(lastRequest(stamp), settings);
    if (wait > 0) await settings.sleep(wait);
    fs.writeFileSync(stamp, String(settings.now()));
  } finally {
    release();
  }
}

function textOf(error) {
  if (typeof error === 'string') return error;
  return [error?.stderr, error?.error?.message, error?.message].filter(Boolean).join('\n');
}

export function isRetryable(run) {
  if (!run.error || run.error.killed) return false;
  return RATE_LIMITED.test(run.stderr ?? '');
}

function shortReason(error) {
  const stderr = typeof error === 'string' ? error : (error?.stderr ?? '');
  const last = stderr.trim().split('\n').pop();
  const reason = last || error?.error?.message || error?.message || 'no error text';
  return reason.slice(0, MAX_REASON);
}

export function failureLine(error) {
  const text = textOf(error);
  if (RATE_LIMITED.test(text)) return 'rate-limited, retry later';
  if (GONE.test(text)) return 'private/removed';
  return shortReason(error);
}
