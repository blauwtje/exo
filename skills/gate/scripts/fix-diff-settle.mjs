import { ledgerDirOf, roundsRun, settleRound, writePending } from './repair-round.mjs';
import { decide as budgetDecision } from '../../../lib/loop-budget.mjs';
import { loopLines } from './gate-repair.mjs';
import { completeMerge } from './review-record.mjs';

function moveToReport(line) {
  if (!line.startsWith('FINDING ')) return line;
  return line.replace(/\bfix(\W*)$/, 'report$1');
}

export function settleFixDiff(pending, merged, { root, planPath }) {
  if (!completeMerge(merged.body)) {
    writePending(ledgerDirOf(root, planPath), pending);
    return merged;
  }
  const newFixInDiff = Number(merged.body.find((line) => line.startsWith('verdict='))?.match(/\bfix=(\d+)/)?.[1] ?? 0);
  const { round, commits, fixBefore } = pending;
  const discard = settleRound({ root, planPath, round, commits, checksGreen: true, newFixInDiff, fixBefore, fixAfter: newFixInDiff });
  if (discard.length === 0) return merged;
  const dir = ledgerDirOf(root, planPath);
  const loop = loopLines(budgetDecision(dir, 'fix'), true, roundsRun(dir, 'fix'));
  const body = [...merged.body.map(moveToReport), ...discard, ...loop];
  const verdict = (line) => line.replace(/\bfix=\d+/, 'fix=0');
  return { ...merged, lines: [...merged.lines.map(moveToReport).map(verdict), ...discard, ...loop], body: body.map(verdict) };
}
