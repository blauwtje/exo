import { execFileSync, spawnSync } from 'node:child_process';
import { LandLockError, withLandLock } from '#land-lock';
import { LockHeldError } from './land-errors.mjs';

export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

export function headMessage(root) {
  const head = spawnSync('git', ['-C', root, 'log', '-1', '--format=%B'], { encoding: 'utf8' });
  return head.status === 0 ? head.stdout : '';
}

export function headSha(root) {
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return head.status === 0 ? head.stdout.trim() : null;
}

export function moveHead(root, message, target, expected) {
  const moved = spawnSync('git', ['-C', root, 'update-ref', '-m', message, 'HEAD', target, expected], { encoding: 'utf8' });
  return moved.status === 0;
}


export function locked(root, action) {
  try {
    return withLandLock(root, action);
  } catch (error) {
    if (error instanceof LandLockError) throw new LockHeldError(error.message);
    throw error;
  }
}
