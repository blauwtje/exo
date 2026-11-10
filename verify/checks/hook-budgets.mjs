import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import {
  HOOK_ENTRIES_LOCK,
  HOOK_LINES_LOCK,
  HOOK_WORK_LOCK,
  HOOK_TEXT_BYTES_LOCK,
  INJECTED_CONTEXT_LOCK
} from '../budgets.mjs';
import { checkSessionLoad } from './session-load.mjs';
import { checkHookMatchers } from './hook-matchers.mjs';
import { countHookWork } from '../hook-work.mjs';

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

const HOOK_SCRIPT = /hooks\/([\w-]+\.mjs)/;

function registeredScripts(repository) {
  const config = JSON.parse(fs.readFileSync(repository.join('hooks/hooks.json'), 'utf8'));
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
  checkHookWork(report, repository);
  checkHookMatchers(report, repository);
  checkSessionLoad(report, repository);
}
