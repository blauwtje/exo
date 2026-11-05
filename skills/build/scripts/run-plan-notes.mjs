import path from 'node:path';
import process from 'node:process';
import { recordStop, recordTask, updateRun } from './run-state.mjs';

export function setPhase(phase) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) updateRun(path.resolve(dir, '..', '..', '..'), path.basename(dir), { phase });
}

export function noteTask(task) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) recordTask(path.resolve(dir, '..', '..', '..'), path.basename(dir), task);
}

export function noteCounts(counts) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) updateRun(path.resolve(dir, '..', '..', '..'), path.basename(dir), counts);
}

export function noteStop(stop) {
  const dir = process.env.EXO_RUN_DIR;
  if (dir) recordStop(path.resolve(dir, '..', '..', '..'), path.basename(dir), stop);
}
