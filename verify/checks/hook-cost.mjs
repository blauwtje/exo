import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { HOOK_ENTRIES_LOCK, HOOK_TEXT_BYTES_LOCK } from '../budgets.mjs';

const NAME = 'hook cost';
const INJECTED_FILES = ['hooks/session-routing.md', 'hooks/session-rules.md', 'hooks/dispatch-rules.md'];
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
  const authored = INJECTED_FILES.reduce((total, name) => total + Buffer.byteLength(readOrEmpty(repository.join(name)).trimEnd()), 0);
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
