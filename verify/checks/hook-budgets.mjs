import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../../harnesses/codex/rules.mjs';
import { readFrontmatter } from '../frontmatter.mjs';
import {
  HOOK_ENTRIES_LOCK,
  HOOK_LINES_LOCK,
  HOOK_WORK_LOCK,
  HOOK_TEXT_BYTES_LOCK,
  INJECTED_CONTEXT_LOCK,
  SESSION_LOAD_LOCK,
  SESSION_START_BYTES_LOCK
} from '../budgets.mjs';

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function checkHookSize(report, repository) {
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

function hookEntryCount(config) {
  const { hooks = {} } = config;
  return Object.values(hooks).flat().reduce((total, group) => total + (group.hooks?.length ?? 0), 0);
}

function readOrEmpty(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function hookTextBytes(repository) {
  return COST_FILES.reduce((total, name) => total + Buffer.byteLength(readOrEmpty(repository.join(name)).trimEnd()), 0);
}

export function checkHookCost(report, repository, locks = { entries: HOOK_ENTRIES_LOCK, bytes: HOOK_TEXT_BYTES_LOCK }) {
  const entries = hookEntryCount(hooksConfig(repository));
  const bytes = hookTextBytes(repository);
  const detail = `${entries} hook entries against ${locks.entries.entries} and ${bytes} bytes of hook text against ${locks.bytes.bytes}, locked on ${locks.entries.measured}`;
  if (entries <= locks.entries.entries && bytes <= locks.bytes.bytes) {
    report.result('PASS', NAME, detail);
    return;
  }
  report.result('FAIL', NAME, `${detail}; every entry spawns a process on its event and every byte rides each turn, so merge or gate the hook and cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
}

const HOOK_SCRIPT = /hooks\/([\w-]+\.mjs)/;

function registeredScripts(repository) {
  const config = hooksConfig(repository);
  const commands = Object.values(config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)));
  return [...new Set(commands.map((command) => HOOK_SCRIPT.exec(command)?.[1]).filter(Boolean))];
}

function workFailure(name, work, lock) {
  if (work === null) return `${name} exited non-zero or is missing`;
  if (work.modules > lock.modules || work.reads > lock.reads) {
    return `${name} loads ${work.modules} modules and reads ${work.reads} files against ${lock.modules} and ${lock.reads}`;
  }
  return null;
}

export function checkHookWork(report, repository, count = countHookWork) {
  const failures = [];
  const scripts = registeredScripts(repository);
  for (const name of scripts) {
    const lock = HOOK_WORK_LOCK.scripts[name];
    if (lock === undefined) {
      failures.push(`${name} has no row in HOOK_WORK_LOCK`);
      continue;
    }
    const failure = workFailure(name, count(repository.join('hooks', name), name), lock);
    if (failure !== null) failures.push(failure);
  }
  if (failures.length > 0) {
    report.result('FAIL', 'hook work', `${failures.join('; ')}, locked on ${HOOK_WORK_LOCK.measured}; cut work on the hook path (eager imports, file reads), or raise the row in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'hook work', `${scripts.length} hook scripts within their module and file-read locks of ${HOOK_WORK_LOCK.measured}`);
}

const MATCHED_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];

function hooksConfig(repository) {
  return JSON.parse(repository.text(repository.join('hooks', 'hooks.json')));
}

function unmatchedGroups(config) {
  return Object.entries(config.hooks ?? {})
    .filter(([event]) => MATCHED_EVENTS.includes(event))
    .flatMap(([event, groups]) => groups.filter((group) => !group.matcher || group.matcher === '*').map(() => event));
}

export function checkHookMatchers(report, repository) {
  const unmatched = unmatchedGroups(hooksConfig(repository));
  if (unmatched.length > 0) {
    report.result('FAIL', 'hook matchers', `${unmatched.length} hooks.json group(s) on ${[...new Set(unmatched)].join(', ')} have no matcher and would spawn on every tool call; add a matcher naming the tools`);
    return;
  }
  report.result('PASS', 'hook matchers', 'every tool-event hook group in hooks/hooks.json names its tools');
}

const PRELOAD = fileURLToPath(new URL('../hook-work-preload.mjs', import.meta.url));
const SCRUBBED_VARIABLES = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR', 'EXO_RUN_SESSION'];
const SESSION_ID = 'hook-work';
const USAGE = { type: 'assistant', timestamp: '2026-01-01T00:00:00.000Z', message: { usage: { input_tokens: 20000, output_tokens: 10 } } };

function scratchEnv(scratch) {
  const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  for (const name of SCRUBBED_VARIABLES) delete env[name];
  return env;
}

const toolCall = (tool, toolInput) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput, session_id: SESSION_ID });

export const HOOK_INPUTS = {
  'session-start.mjs': () => ({ hook_event_name: 'SessionStart', source: 'startup', session_id: SESSION_ID }),
  'dispatch-bash.mjs': () => toolCall('Bash', { command: 'git status' }),
  'agent-effort.mjs': () => toolCall('Agent', { subagent_type: 'exo:lookup', prompt: 'Reads: none' }),
  'context-limit.mjs': (scratch) => ({ ...toolCall('Read', { file_path: path.join(scratch, 'a.txt') }), transcript_path: path.join(scratch, 'session.jsonl') }),
  'run-no-wait.mjs': () => ({ hook_event_name: 'Stop', session_id: SESSION_ID }),
  'session-end.mjs': () => ({ hook_event_name: 'SessionEnd', session_id: SESSION_ID })
};

function prepare(scratch) {
  fs.writeFileSync(path.join(scratch, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(scratch, 'session.jsonl'), `${JSON.stringify(USAGE)}\n`);
}

export function countHookWork(script, name) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-hook-work-'));
  const output = path.join(scratch, 'work.json');
  prepare(scratch);
  const input = { ...HOOK_INPUTS[name](scratch), cwd: scratch };
  const env = { ...scratchEnv(scratch), EXO_HOOK_WORK_OUT: output };
  try {
    const run = spawnSync(process.execPath, ['--import', PRELOAD, script], { input: JSON.stringify(input), encoding: 'utf8', env, cwd: scratch });
    if (run.status !== 0 || !fs.existsSync(output)) return null;
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const words = (text) => text.split(/\s+/).filter((word) => word !== '').length;

function sessionStartWords(repository) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-session-load-'));
  try {
    const run = spawnSync(process.execPath, [repository.join('hooks', 'session-start.mjs')], {
      env: scratchEnv(scratch), input: JSON.stringify({ cwd: scratch, source: 'startup' }), encoding: 'utf8'
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

function blockedMessage(repository, file) {
  return `count blocked by unparsed frontmatter in ${repository.relative(file)}`;
}

function skillWords(repository) {
  let total = 0;
  for (const file of repository.everySkillFile()) {
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) return { blocked: blockedMessage(repository, file) };
    if (parsed.values.get('disable-model-invocation') === 'true') continue;
    total += words(`${parsed.values.get('name') ?? path.basename(path.dirname(file))} ${parsed.values.get('description') ?? ''}`);
  }
  return { total };
}

function agentWords(repository) {
  let total = 0;
  for (const file of repository.agentFiles()) {
    const { fields } = splitFrontmatter(repository.text(file));
    if (fields === null) return { blocked: blockedMessage(repository, file) };
    total += words(`${fields.name ?? path.basename(file, '.md')} ${fields.description ?? ''}`);
  }
  return { total };
}

export function checkSessionLoad(report, repository) {
  const start = sessionStartWords(repository);
  if (start.error) {
    report.result('UNRUN', 'session load', start.error);
    return;
  }
  const skillCount = skillWords(repository);
  const agentCount = skillCount.blocked ? skillCount : agentWords(repository);
  if (agentCount.blocked) {
    report.result('UNRUN', 'session load', agentCount.blocked);
    return;
  }
  const skills = skillCount.total;
  const agents = agentCount.total;
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

export const CONTEXT_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md'];
const NAMES = CONTEXT_FILES.join(' and ');

function checkInjectedContext(report, repository) {
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
  checkHookWork(report, repository);
  checkHookMatchers(report, repository);
  checkSessionLoad(report, repository);
}
