import { spawnSync } from 'node:child_process';
import { headMessage } from './land-git.mjs';
import { LandingError } from './land-errors.mjs';

const RAISE_PREFIX = /^Budget-raise:[ \t]/;

export function raiseLinesOf(reportText) {
  if (reportText === null) return [];
  return [...new Set(reportText.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter((line) => RAISE_PREFIX.test(line)))];
}

export function carryRaises(root, reportText) {
  const message = headMessage(root);
  const present = new Set(message.split('\n'));
  const missing = raiseLinesOf(reportText).filter((line) => !present.has(line));
  if (missing.length === 0) return;
  const amended = spawnSync('git', ['-C', root, 'commit', '--amend', '-q', '--no-verify', '-F', '-'], { encoding: 'utf8', input: `${message.trimEnd()}\n${missing.join('\n')}\n` });
  if (amended.status !== 0) throw new LandingError(`carrying the Budget-raise lines onto the task commit failed:\n${amended.stderr}`);
}
