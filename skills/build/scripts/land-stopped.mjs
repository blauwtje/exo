import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SCRATCH_FOLDER } from '#scratch-path';
import { git, headMessage } from './land-git.mjs';

export const CHECKPOINT_TRAILER = /^(?:Plan-checkpoint|Checkpoint): /m;

export const handoffPathOf = (root, number) => path.join(root, SCRATCH_FOLDER, `handoff-task-${number}.md`);

function checkpointRun(root) {
  let count = 0;
  for (;;) {
    const message = spawnSync('git', ['-C', root, 'log', '-1', '--format=%B', `HEAD~${count}`], { encoding: 'utf8' });
    if (message.status !== 0 || !CHECKPOINT_TRAILER.test(message.stdout)) return count;
    count += 1;
  }
}

export function foldCheckpoints(root) {
  const count = checkpointRun(root);
  if (count > 0) git(root, 'reset', '--soft', `HEAD~${count}`);
  return count;
}

export const STDIN_REPORT = 'stdin';

export const implementerReportPath = (root, number) => path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`);

function fileReportOf(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function handoffReportOf(root, number) {
  const handoff = handoffPathOf(root, number);
  return fs.existsSync(handoff) ? `Stopped worker, work taken from the handoff at ${handoff}\n` : null;
}

function checkpointReportOf(root) {
  if (!CHECKPOINT_TRAILER.test(headMessage(root))) return null;
  return `Stopped worker, work taken from the checkpoint commit ${git(root, 'rev-parse', '--short', 'HEAD')}\n`;
}

export function reportFlagOf(report) {
  if (report !== '-') return { reportText: null, reportPath: report ?? null };
  return { reportText: fs.readFileSync(0, 'utf8'), reportPath: STDIN_REPORT };
}

const filled = (text) => text !== null && text.trim() !== '';

export function reportSourceOf({ root, number, reportText = null, reportPath = null }) {
  const named = reportPath ?? (reportText === null ? implementerReportPath(root, number) : STDIN_REPORT);
  if (filled(reportText)) return { reportText, reportPath: named };
  const file = named === STDIN_REPORT ? implementerReportPath(root, number) : named;
  const fromFile = fileReportOf(file);
  if (filled(fromFile)) return { reportText: fromFile, reportPath: file };
  return { reportText: handoffReportOf(root, number) ?? checkpointReportOf(root), reportPath: named };
}
