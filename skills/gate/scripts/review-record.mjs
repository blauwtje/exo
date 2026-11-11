import path from 'node:path';
import { appendStep, readJournal, resumePoint } from '../../build/scripts/run-state.mjs';
import { GATE_RUN_ID } from './gate-journal.mjs';
import { gitOutput } from './gate-command.mjs';

export function recordedReview(root) {
  return resumePoint(readJournal(root, GATE_RUN_ID)).gateReview;
}

export function recordReview(root, reports) {
  if (recordedReview(root) !== null) return;
  const isOverlap = (report) => path.basename(report).includes('overlap');
  appendStep(root, GATE_RUN_ID, {
    kind: 'gate-review',
    sha: gitOutput(root, ['rev-parse', 'HEAD']),
    branch: reports.filter((report) => !isOverlap(report)),
    overlap: reports.filter(isOverlap)
  });
}

export function completeMerge(body) {
  return body.some((line) => /^verdict=(?!BLOCKED)/.test(line));
}
