import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { contextLimit, contextTokens, softLimit } from './context-limits.mjs';

const STDIN_CEILING_MS = 1000;
const CACHE_TTL_SECONDS = 12 * 3600;
const EFFORT_COLORS = { low: 245, medium: 38, high: 33, xhigh: 99, max: 171 };

const clean = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '') : '');
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const oneDecimal = (value) => (Math.round(value * 10) / 10).toFixed(1);

function windowOf(raw) {
  const used = number(raw?.used_percentage);
  return used === null ? null : { resets_at: number(raw.resets_at), used_percentage: used };
}

function unexpired(window, cachedAt, nowSeconds) {
  if (window === null) return null;
  if (window.resets_at !== null) return window.resets_at > nowSeconds ? window : null;
  return cachedAt !== null && nowSeconds - cachedAt < CACHE_TTL_SECONDS ? window : null;
}

function windows(payload, cache, nowSeconds) {
  const cachedAt = number(cache?.cached_at);
  const pick = (key) => windowOf(payload?.rate_limits?.[key]) ?? unexpired(windowOf(cache?.[key]), cachedAt, nowSeconds);
  return { fiveHour: pick('five_hour'), sevenDay: pick('seven_day') };
}

function timeLeft(resetsAt, nowSeconds) {
  const minutes = resetsAt === null ? 0 : Math.ceil((resetsAt - nowSeconds) / 60);
  if (minutes <= 0) return '5h';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function contextColor(tokens, limit) {
  if (tokens >= limit) return 31;
  return tokens >= softLimit(limit) ? 33 : 32;
}

function contextPart(payload, env, paint) {
  const context = payload?.context_window ?? {};
  const tokens = contextTokens(payload?.transcript_path) ?? number(context.total_input_tokens) ?? 0;
  const size = number(context.context_window_size);
  const hasSize = size !== null && size > 0;
  const limit = hasSize ? Math.min(contextLimit(env.HOME || os.homedir()), size) : contextLimit(env.HOME || os.homedir());
  const share = hasSize ? (tokens * 100) / size : number(context.used_percentage);
  const text = `${oneDecimal(tokens / 1000)}k${share === null ? '' : ` (${oneDecimal(share)}%)`}`;
  return paint(contextColor(tokens, limit), text);
}

export function render(payload, { env = process.env, now = Date.now(), cache = null } = {}) {
  const nowSeconds = now / 1000;
  const colored = !env.NO_COLOR;
  const paint = (code, text) => (colored ? `\x1b[${code}m${text}\x1b[0m` : text);
  const { fiveHour, sevenDay } = windows(payload, cache, nowSeconds);
  const session = fiveHour === null ? '5h –%' : `${timeLeft(fiveHour.resets_at, nowSeconds)} ${Math.round(fiveHour.used_percentage)}%`;
  const week = sevenDay === null ? '7d –%' : `7d ${Math.round(sevenDay.used_percentage)}%`;
  const model = clean(payload?.model?.display_name).replace(/ *\([^)]*\)$/, '');
  const effort = clean(payload?.effort?.level).toLowerCase();
  const effortCode = EFFORT_COLORS[effort];
  const effortText = effortCode ? paint(`38;5;${effortCode}`, effort) : effort;
  const modelPart = [model, effortText].filter(Boolean).join(' ');
  const parts = [contextPart(payload, env, paint), session, week, modelPart].filter(Boolean);
  return `${paint(1, 'exo')} ${parts.join(' · ')}`;
}

export function cacheUpdate(payload, cache, now) {
  const nowSeconds = now / 1000;
  if (!payload?.rate_limits?.five_hour && !payload?.rate_limits?.seven_day) return null;
  const merged = windows(payload, cache, nowSeconds);
  return { cached_at: nowSeconds, five_hour: merged.fiveHour, seven_day: merged.sevenDay };
}

const cacheFile = (env) => path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'exo', 'statusline-rate-limits.json');

function readCache(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { cached_at: number(raw.cached_at), five_hour: windowOf(raw.five_hour), seven_day: windowOf(raw.seven_day) };
  } catch {
    return null;
  }
}

function writeCache(file, update) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(update)}\n`);
    fs.renameSync(tmp, file);
  } catch {
    fs.rmSync(tmp, { force: true });
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const finish = () => { clearTimeout(timer); process.stdin.pause(); resolve(data); };
    const timer = setTimeout(finish, STDIN_CEILING_MS);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

export async function main() {
  let payload = {};
  try { payload = JSON.parse(await readStdin()) ?? {}; } catch { }
  const now = Date.now();
  const file = cacheFile(process.env);
  const cache = readCache(file);
  process.stdout.write(render(payload, { env: process.env, now, cache }));
  const update = cacheUpdate(payload, cache, now);
  if (update) writeCache(file, update);
}
