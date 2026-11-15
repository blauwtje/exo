import path from 'node:path';
import process from 'node:process';
import { appendStep, readJournal, readState, recordStop, recordTask, updateRun } from './run-state.mjs';

function runTarget() {
  const dir = process.env.EXO_RUN_DIR;
  return dir ? [path.resolve(dir, '..', '..', '..'), path.basename(dir)] : null;
}

const note = (write) => (value) => {
  const target = runTarget();
  if (target) write(...target, value);
};

export const setPhase = (phase) => note(updateRun)({ phase });
export const noteTask = note(recordTask);
export const noteCounts = note(updateRun);
export const noteStop = note(recordStop);
export const noteStep = note(appendStep);

export function journalSteps() {
  const target = runTarget();
  return target ? readJournal(...target) : [];
}

export function savedSpend() {
  const target = runTarget();
  return target ? readState(...target)?.spent ?? 0 : 0;
}
