import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { CONTEXT_LIMIT, contextTokens } from './context-limits.mjs';
import { liveBuild } from './build-progress.mjs';

const STDIN_CEILING_MS = 1000;
const DEFAULT_WINDOW = 200_000;
const CACHE_TTL_SECONDS = 12 * 3600;

const clean = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '') : '');
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

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

const WINDOW_MINUTES = 300;
const BRANCH_MAX = 20;

function duration(minutes) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function runOut(fiveHour, nowSeconds) {
  if (fiveHour === null || fiveHour.resets_at === null || fiveHour.used_percentage <= 0) return null;
  const elapsed = (nowSeconds - (fiveHour.resets_at - WINDOW_MINUTES * 60)) / 60;
  if (elapsed < 30 || nowSeconds >= fiveHour.resets_at) return null;
  const used = fiveHour.used_percentage;
  const left = used >= 100 ? 0 : Math.ceil((elapsed * (100 - used)) / used);
  return nowSeconds + left * 60 < fiveHour.resets_at ? `5h out in ${duration(left)}` : null;
}

function branchPart(branch) {
  const name = clean(branch);
  return name.length > BRANCH_MAX ? `${name.slice(0, BRANCH_MAX - 1)}…` : name;
}

function contextPart(payload, dim, warn) {
  const context = payload?.context_window ?? {};
  const tokens = contextTokens(payload?.transcript_path) ?? number(context.total_input_tokens) ?? 0;
  const size = number(context.context_window_size);
  const window = size !== null && size > 0 ? size : DEFAULT_WINDOW;
  const used = `${Math.round(tokens / 1000)}k`;
  return `${dim('ctx')} ${tokens >= CONTEXT_LIMIT ? warn(used) : used}${dim(`/${Math.round(window / 1000)}k`)}`;
}

export function render(payload, { env = process.env, now = Date.now(), cache = null, branch = null, build = null } = {}) {
  const nowSeconds = now / 1000;
  const colored = !env.NO_COLOR;
  const paint = (code, text) => (colored ? `\x1b[${code}m${text}\x1b[0m` : text);
  const dim = (text) => paint(2, text);
  const warn = (text) => paint('38;5;215', text);
  const { fiveHour, sevenDay } = windows(payload, cache, nowSeconds);
  const model = clean(payload?.model?.display_name).replace(/ *\([^)]*\)$/, '');
  const modelPart = [model, clean(payload?.effort?.level).toLowerCase()].filter(Boolean).join(' ');
  const buildPart = build ? `build ${Math.min(build.landed + 1, build.total)}/${build.total}` : '';
  const first = [paint('1;38;5;141', '◉ exo'), branchPart(branch), modelPart && dim(modelPart), buildPart && paint(1, buildPart)];
  const warning = runOut(fiveHour, nowSeconds);
  const second = [
    contextPart(payload, dim, warn),
    `${dim('5h')} ${fiveHour === null ? '–' : Math.round(fiveHour.used_percentage)}%`,
    sevenDay !== null && sevenDay.used_percentage >= 50 ? `${dim('7d')} ${Math.round(sevenDay.used_percentage)}%` : '',
    warning && warn(warning),
  ];
  const join = (parts) => parts.filter(Boolean).join('   ');
  return `${join(first)}\n  ${join(second)}`;
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

function gitDirectoryOf(folder) {
  const dot = path.join(folder, '.git');
  if (!fs.existsSync(dot)) return undefined;
  if (fs.statSync(dot).isDirectory()) return dot;
  const target = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dot, 'utf8'))?.[1].trim();
  return target ? path.resolve(folder, target) : null;
}

function gitDirectory(start) {
  for (let folder = path.resolve(start); ; folder = path.dirname(folder)) {
    const found = gitDirectoryOf(folder);
    if (found !== undefined) return found;
    if (path.dirname(folder) === folder) return null;
  }
}

function readBranch(payload) {
  const start = payload?.workspace?.current_dir ?? payload?.cwd;
  if (typeof start !== 'string' || start === '') return null;
  try {
    const head = fs.readFileSync(path.join(gitDirectory(start), 'HEAD'), 'utf8').trim();
    const ref = /^ref: refs\/heads\/(.+)$/.exec(head);
    if (ref) return ref[1];
    return /^[0-9a-f]{40,}$/.test(head) ? head.slice(0, 7) : null;
  } catch {
    return null;
  }
}

function readBuild(payload) {
  try { return typeof payload?.session_id === 'string' ? liveBuild(payload.session_id) : null; } catch { return null; }
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
  process.stdout.write(render(payload, { env: process.env, now, cache, branch: readBranch(payload), build: readBuild(payload) }));
  const update = cacheUpdate(payload, cache, now);
  if (update) writeCache(file, update);
}
