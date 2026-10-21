import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { environmentMs } from './script-flags.mjs';

export const IMPACT_MAX_PATHS = 6;
export const IMPACT_MAX_TESTS = 3;
export const IMPACT_TIMEOUT_MS = 2000;

const SOURCE = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'php', 'cs', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'lua', 'ex', 'exs', 'dart', 'sh']);
const GROUP_NAMES = new Set(['index', 'main', 'mod', 'lib', '__init__']);
const SKIP_DIRS = ['node_modules', 'vendor', 'dist', 'build', 'target', '.git', '.worktrees', '.venv'];

const extensionOf = (file) => path.extname(file).slice(1).toLowerCase();

export function isTestPath(file) {
  const rel = file.split(path.sep).join('/');
  return /(^|\/)(tests?|__tests__|specs?)\//i.test(rel) || /(\.|_)(test|spec)\.[^/]+$/i.test(rel) || /(^|\/)test_[^/]+$/i.test(rel);
}

export function importName(file) {
  const parsed = path.parse(file);
  const stem = GROUP_NAMES.has(parsed.name) ? path.basename(parsed.dir) : parsed.name;
  return /^[\w-]{2,}$/.test(stem) ? stem : null;
}

const seenFile = (sessionId) => path.join(os.tmpdir(), `exo-impact-${String(sessionId).replace(/[^\w-]/g, '_')}`);

function firstEdit(sessionId, file) {
  try {
    const store = seenFile(sessionId);
    let seen = [];
    try { seen = fs.readFileSync(store, 'utf8').split('\n'); } catch { }
    if (seen.includes(file)) return false;
    fs.appendFileSync(store, `${file}\n`);
    return true;
  } catch {
    return false;
  }
}

function proximity(from, other) {
  const a = path.dirname(from).split('/');
  const b = path.dirname(other).split('/');
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
  return shared;
}

export function searchImporters({ cwd, name, timeoutMs }) {
  const quoted = `['"/]${name}(\\.[A-Za-z]+)?['"]`;
  const keyword = `(^|[^[:alnum:]_])(from|import|use|require|include|using|load|source)[ \t(](.*[^[:alnum:]_])?${name}([^[:alnum:]_]|$)`;
  const excludes = SKIP_DIRS.map((dir) => `:(exclude,glob)**/${dir}/**`);
  const run = spawnSync('git', ['grep', '--no-index', '--exclude-standard', '-I', '-l', '-E', '-e', quoted, '-e', keyword, '--', '.', ...excludes], {
    cwd, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
  });
  if (run.error || run.status !== 0) return [];
  return run.stdout.split('\n').map((line) => line.replace(/^\.\//, '')).filter(Boolean);
}

export function impactNote({ cwd, file, sessionId, timeoutMs = environmentMs('EXO_EDIT_IMPACT_MS', IMPACT_TIMEOUT_MS), search = searchImporters }) {
  if (typeof file !== 'string' || typeof cwd !== 'string' || sessionId === undefined || sessionId === null) return null;
  const absolute = path.resolve(cwd, file);
  const rel = path.relative(cwd, absolute).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..') || !SOURCE.has(extensionOf(rel)) || isTestPath(rel)) return null;
  if (!fs.existsSync(absolute) || !firstEdit(sessionId, absolute)) return null;
  const name = importName(rel);
  if (!name) return null;
  const hits = search({ cwd, name, timeoutMs })
    .filter((hit) => hit !== rel && SOURCE.has(extensionOf(hit)))
    .sort((a, b) => proximity(rel, b) - proximity(rel, a) || a.localeCompare(b));
  const tests = hits.filter(isTestPath);
  const callers = hits.filter((hit) => !isTestPath(hit));
  if (tests.length + callers.length === 0) return null;
  const shownTests = tests.slice(0, IMPACT_MAX_TESTS);
  const shownCallers = callers.slice(0, IMPACT_MAX_PATHS - shownTests.length);
  const more = (list, shown) => (list.length > shown.length ? ` (+${list.length - shown.length})` : '');
  const parts = [];
  if (callers.length > 0) parts.push(`Imported by ${shownCallers.join(', ')}${more(callers, shownCallers)}.`);
  if (tests.length > 0) parts.push(`Tests loading it: ${shownTests.join(', ')}${more(tests, shownTests)}.`);
  return `${rel}: ${parts.join(' ')} Check them against this change.`;
}

export function impactFields(hookInput) {
  const input = hookInput ?? {};
  if (!['Edit', 'Write', 'MultiEdit'].includes(input.tool_name)) return null;
  const text = impactNote({ cwd: input.cwd, file: input.tool_input?.file_path, sessionId: input.session_id });
  return text ? { additionalContext: text } : null;
}
