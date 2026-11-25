import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from './config-directory.mjs';
import { gitLine } from './git.mjs';

const DEFAULT_WINDOW = 200_000;
const STDIN_CEILING_MS = 1000;
const GIT_TIMEOUT_MS = 500;
const BRANCH_MAX = 20;
const COMPACT_MIN = 100_000;
const COMPACT_MAX = 1_000_000;
const SUFFIX = { '': 1, k: 1000, m: 1_000_000 };

const clean = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '') : '');
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const objectOf = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});

function limitWindow(raw) {
  const used = number(raw?.used_percentage);
  return used === null ? null : { resets_at: number(raw.resets_at), used_percentage: used };
}

function duration(minutes) {
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function windowSize(tokens) {
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${String(Math.round(tokens / 100_000) / 10).replace(/\.0$/, '')}M`;
}

function limitPart(label, { window, nowSeconds }, dim) {
  const percent = `${dim(label)} ${window === null ? '–' : Math.round(window.used_percentage)}%`;
  if (window === null || window.resets_at === null || window.resets_at <= nowSeconds) return percent;
  return `${percent} ${dim(`resets in ${duration(Math.ceil((window.resets_at - nowSeconds) / 60))}`)}`;
}

function branchPart(branch) {
  const name = clean(branch);
  return name.length > BRANCH_MAX ? `${name.slice(0, BRANCH_MAX - 1)}…` : name;
}

function envWindow(raw) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([km]?)\s*$/i.exec(raw ?? '');
  if (!match) return null;
  const tokens = Math.round(Number(match[1]) * SUFFIX[match[2].toLowerCase()]);
  return tokens > 0 ? Math.min(Math.max(tokens, COMPACT_MIN), COMPACT_MAX) : null;
}

const savedWindow = (value) => (Number.isInteger(value) && value >= COMPACT_MIN && value <= COMPACT_MAX ? value : null);

function fileWindow(file) {
  try {
    return savedWindow(objectOf(JSON.parse(fs.readFileSync(file, 'utf8'))).autoCompactWindow);
  } catch {
    return null;
  }
}

function settingsFiles(payload, env) {
  const project = payload?.workspace?.project_dir;
  const user = path.join(configDirectory(env), 'settings.json');
  if (typeof project !== 'string' || project === '') return [user];
  return [path.join(project, '.claude', 'settings.local.json'), path.join(project, '.claude', 'settings.json'), user];
}

function configuredWindow(payload, env) {
  const fromEnv = envWindow(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
  if (fromEnv !== null) return fromEnv;
  return settingsFiles(payload, env).map(fileWindow).find((window) => window !== null) ?? null;
}

function effectiveWindow(payload, env) {
  const size = number(payload?.context_window?.context_window_size);
  const full = size !== null && size > 0 ? size : null;
  const configured = configuredWindow(payload, env);
  if (configured === null) return full ?? DEFAULT_WINDOW;
  return full === null ? configured : Math.min(configured, full);
}

function contextTokens(payload) {
  const usage = objectOf(payload?.context_window?.current_usage);
  const sum = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((total, key) => total + (number(usage[key]) ?? 0), 0);
  return sum;
}

function contextPart(payload, env, { dim, paint }) {
  const used = `${Math.round(contextTokens(payload) / 1000)}k`;
  return `${dim('ctx')} ${paint(32, used)}${dim(`/${windowSize(effectiveWindow(payload, env))}`)}`;
}

export function render(payload, { env = process.env, now = Date.now(), branch = null } = {}) {
  const nowSeconds = now / 1000;
  const colored = !env.NO_COLOR;
  const paint = (code, text) => (colored ? `\x1b[${code}m${text}\x1b[0m` : text);
  const dim = (text) => paint(2, text);
  const model = clean(payload?.model?.display_name).replace(/ *\([^)]*\)$/, '');
  const modelPart = [model, clean(payload?.effort?.level).toLowerCase()].filter(Boolean).join(' ');
  const first = [paint('1;38;5;141', '◉ exo'), branchPart(branch), modelPart && dim(modelPart)];
  const second = [
    contextPart(payload, env, { dim, paint }),
    limitPart('5h', { window: limitWindow(payload?.rate_limits?.five_hour), nowSeconds }, dim),
    limitPart('7d', { window: limitWindow(payload?.rate_limits?.seven_day), nowSeconds }, dim),
  ];
  const join = (parts) => parts.filter(Boolean).join('   ');
  return `${join(first)}\n  ${join(second)}`;
}

function readBranch(payload) {
  const directory = payload?.workspace?.current_dir;
  const cwd = typeof directory === 'string' && directory !== '' ? directory : process.cwd();
  return gitLine(cwd, ['branch', '--show-current'], { timeout: GIT_TIMEOUT_MS });
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

function parsePayload(text) {
  try {
    return JSON.parse(text) ?? {};
  } catch {
    return {};
  }
}

export async function main() {
  const payload = parsePayload(await readStdin());
  process.stdout.write(render(payload, { branch: readBranch(payload) }));
}
