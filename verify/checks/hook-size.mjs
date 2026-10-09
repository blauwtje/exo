// Hook code runs on every Bash call and session start, so its size is locked:
// the lines of hooks/**/*.mjs plus lib/hook-input.mjs stay within
// HOOK_LINES_LOCK. Growth fails, shrinking passes; a raise is a hand edit in the
// commit that pays for it.

import fs from 'node:fs';
import { HOOK_LINES_LOCK } from '../budgets.mjs';

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
