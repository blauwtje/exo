import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from '../../harnesses/codex/rules.mjs';
import { readFrontmatter } from '../frontmatter.mjs';
import {
  HOOK_ENTRIES_LOCK,
  HOOK_LINES_LOCK,
  HOOK_SPAWN_MS_LOCK,
  HOOK_TEXT_BYTES_LOCK,
  INJECTED_CONTEXT_LOCK,
  SESSION_LOAD_LOCK,
  SESSION_START_BYTES_LOCK
} from '../budgets.mjs';

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

export function checkHookSize(report, repository) {
  const files = [...repository.walk(repository.join('hooks'), (file) => file.endsWith('.mjs')), repository.join('lib/hook-input.mjs')]
    .filter((file) => fs.existsSync(file));
  const lines = files.reduce((total, file) => total + lineCount(file), 0);
  const detail = `${lines} lines of hook code in ${files.length} files against the ${HOOK_LINES_LOCK.lines} locked on ${HOOK_LINES_LOCK.measured}`;
  if (lines > HOOK_LINES_LOCK.lines) {
    report.result('FAIL', 'hook size', `${detail}; cut hook code, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'hook size', detail);
}

const NAME = 'hook cost';
const COST_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md', 'hooks/dispatch-rules.md'];
const REASON_SOURCE = 'hooks/dispatch-bash.mjs';
const REASON = /permissionDecisionReason: (['`])((?:(?!\1).)*)\1/g;

export function hookEntryCount(hooksText) {
  const { hooks = {} } = JSON.parse(hooksText);
  return Object.values(hooks).flat().reduce((total, group) => total + (group.hooks?.length ?? 0), 0);
}

export function reasonBytes(sourceText) {
  return [...sourceText.matchAll(REASON)].reduce((total, match) => total + Buffer.byteLength(match[2]), 0);
}

function readOrEmpty(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

export function hookTextBytes(repository) {
  const authored = COST_FILES.reduce((total, name) => total + Buffer.byteLength(readOrEmpty(repository.join(name)).trimEnd()), 0);
  return authored + reasonBytes(readOrEmpty(repository.join(REASON_SOURCE)));
}

export function checkHookCost(report, repository, locks = { entries: HOOK_ENTRIES_LOCK, bytes: HOOK_TEXT_BYTES_LOCK }) {
  const entries = hookEntryCount(fs.readFileSync(repository.join('hooks/hooks.json'), 'utf8'));
  const bytes = hookTextBytes(repository);
  const detail = `${entries} hook entries against ${locks.entries.entries} and ${bytes} bytes of hook text against ${locks.bytes.bytes}, locked on ${locks.entries.measured}`;
  if (entries <= locks.entries.entries && bytes <= locks.bytes.bytes) {
    report.result('PASS', NAME, detail);
    return;
  }
  report.result('FAIL', NAME, `${detail}; every entry spawns a process on its event and every byte rides each turn, so merge or gate the hook and cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
}

const WARMUP_SPAWNS = 1;
const TIMED_SPAWNS = 7;
const SCRUBBED_VARIABLES = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_SESSION'];

function scratchEnv(scratch) {
  const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  for (const name of SCRUBBED_VARIABLES) delete env[name];
  return env;
}

function spawnMilliseconds(script, scratch) {
  const input = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
    session_id: 'hook-latency',
    cwd: scratch
  });
  const started = performance.now();
  const run = spawnSync(process.execPath, [script], { env: scratchEnv(scratch), input, encoding: 'utf8', cwd: scratch });
  const elapsed = performance.now() - started;
  return run.status === 0 ? elapsed : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureMedian(script) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-latency-'));
  try {
    const runs = Array.from({ length: WARMUP_SPAWNS + TIMED_SPAWNS }, () => spawnMilliseconds(script, scratch)).slice(WARMUP_SPAWNS);
    return runs.includes(null) ? null : median(runs);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkHookLatency(report, repository) {
  const script = repository.join('hooks', 'dispatch-bash.mjs');
  const milliseconds = fs.existsSync(script) ? measureMedian(script) : null;
  if (milliseconds === null) {
    report.result('FAIL', 'hook latency', 'hooks/dispatch-bash.mjs is missing or exited non-zero on a Bash input');
    return;
  }
  const detail = `${milliseconds.toFixed(1)} ms median per Bash hook spawn over ${TIMED_SPAWNS} runs against the ${HOOK_SPAWN_MS_LOCK.ms} ms locked on ${HOOK_SPAWN_MS_LOCK.measured}`;
  if (milliseconds > HOOK_SPAWN_MS_LOCK.ms) {
    report.result('FAIL', 'hook latency', `${detail}; cut work on the hook path (eager imports, file reads), or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'hook latency', detail);
}

const words = (text) => text.split(/\s+/).filter((word) => word !== '').length;

function sessionStartWords(repository) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-session-load-'));
  try {
    const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
    for (const name of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR']) delete env[name];
    const run = spawnSync(process.execPath, [repository.join('hooks', 'session-start.mjs')], {
      env, input: JSON.stringify({ cwd: scratch, source: 'startup' }), encoding: 'utf8'
    });
    if (run.status !== 0) return { error: `hooks/session-start.mjs exited ${run.status}` };
    const context = JSON.parse(run.stdout).hookSpecificOutput.additionalContext;
    return { count: words(context), bytes: Buffer.byteLength(context, 'utf8') };
  } catch (error) {
    return { error: `hooks/session-start.mjs output unreadable, ${error.message}` };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkSessionLoad(report, repository) {
  const start = sessionStartWords(repository);
  if (start.error) {
    report.result('UNRUN', 'session load', start.error);
    return;
  }
  let skills = 0;
  for (const file of repository.everySkillFile()) {
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      report.result('UNRUN', 'session load', `count blocked by unparsed frontmatter in ${repository.relative(file)}`);
      return;
    }
    if (parsed.values.get('disable-model-invocation') === 'true') continue;
    skills += words(`${parsed.values.get('name') ?? path.basename(path.dirname(file))} ${parsed.values.get('description') ?? ''}`);
  }
  let agents = 0;
  for (const file of repository.agentFiles()) {
    const { fields } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (fields === null) {
      report.result('UNRUN', 'session load', `count blocked by unparsed frontmatter in ${repository.relative(file)}`);
      return;
    }
    agents += words(`${fields.name ?? path.basename(file, '.md')} ${fields.description ?? ''}`);
  }
  if (start.bytes > SESSION_START_BYTES_LOCK.bytes) {
    report.result('FAIL', 'session load', `hooks/session-start.mjs injects ${start.bytes} bytes, over the ${SESSION_START_BYTES_LOCK.bytes} locked on ${SESSION_START_BYTES_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  const total = start.count + skills + agents;
  const parts = `${start.count} session start + ${skills} skills + ${agents} agents`;
  if (total > SESSION_LOAD_LOCK.words) {
    report.result('FAIL', 'session load', `every session loads ${total} words (${parts}), over the ${SESSION_LOAD_LOCK.words} locked on ${SESSION_LOAD_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'session load', `every session loads ${total} words (${parts}) against the ${SESSION_LOAD_LOCK.words} locked on ${SESSION_LOAD_LOCK.measured}`);
}

const CONTEXT_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md'];
const NAMES = CONTEXT_FILES.join(' and ');

export function checkInjectedContext(report, repository) {
  const present = CONTEXT_FILES.map((name) => repository.join(name)).filter((file) => fs.existsSync(file));
  const bytes = present.reduce((sum, file) => sum + Buffer.byteLength(fs.readFileSync(file, 'utf8').trimEnd(), 'utf8'), 0);
  if (bytes > INJECTED_CONTEXT_LOCK.bytes) {
    report.result('FAIL', 'injected context budget', `${NAMES} inject ${bytes} bytes, over the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'injected context budget', `${NAMES} inject ${bytes} bytes against the ${INJECTED_CONTEXT_LOCK.bytes} locked on ${INJECTED_CONTEXT_LOCK.measured}`);
}

export function checkHookBudgets(report, repository) {
  checkInjectedContext(report, repository);
  checkHookSize(report, repository);
  checkHookCost(report, repository);
  checkHookLatency(report, repository);
  checkSessionLoad(report, repository);
}
