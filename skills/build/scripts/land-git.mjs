import { git } from '#git';
import { LandLockError, withLandLock } from '#land-lock';
import { LockHeldError } from './land-errors.mjs';

export function headMessage(root) {
  const head = git(root, ['log', '-1', '--format=%B']);
  return head.status === 0 ? head.stdout : '';
}

export function headSha(root) {
  const head = git(root, ['rev-parse', 'HEAD']);
  return head.status === 0 ? head.stdout.trim() : null;
}

export function moveHead(root, message, { target, expected }) {
  const moved = git(root, ['update-ref', '-m', message, 'HEAD', target, expected]);
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
