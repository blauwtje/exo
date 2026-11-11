import { settleRound, writePending } from './repair-round.mjs';
import { completeMerge } from './review-record.mjs';

function moveToReport(line) {
  if (!line.startsWith('FINDING ')) return line;
  return line.replace(/\bfix(\W*)$/, 'report$1');
}

export function settleFixDiff(pending, merged, root) {
  if (!completeMerge(merged.body)) {
    writePending(root, pending);
    return merged;
  }
  const newFixInDiff = Number(merged.body.find((line) => line.startsWith('verdict='))?.match(/\bfix=(\d+)/)?.[1] ?? 0);
  const { round, commits, fixBefore } = pending;
  const discard = settleRound({ root, round, commits, checksGreen: true, newFixInDiff, fixBefore, fixAfter: newFixInDiff });
  if (discard.length === 0) return merged;
  const body = [...merged.body.map(moveToReport), ...discard];
  const verdict = (line) => line.replace(/\bfix=\d+/, 'fix=0');
  return { ...merged, lines: [...merged.lines.map(moveToReport).map(verdict), ...discard], body: body.map(verdict) };
}
