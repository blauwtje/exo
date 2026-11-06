import { spawnSync } from 'node:child_process';
import { handoffNote } from './run-plan-session.mjs';

function latestCheckpoint(root, number) {
  const found = spawnSync('git', ['-C', root, 'log', '-1', '--format=%h', '--extended-regexp', `--grep=^Plan-checkpoint: .+/${number}$`], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : '';
}

export function handoffLines(task, root) {
  const note = handoffNote({ root }, task.number).trim();
  const checkpoint = latestCheckpoint(root, task.number);
  return [
    ...(note === '' ? [] : [`Handoff: ${note}`]),
    ...(checkpoint === '' ? [] : [`Plan-checkpoint: ${checkpoint}`])
  ];
}
