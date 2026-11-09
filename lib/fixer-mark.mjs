import { createHash } from 'node:crypto';

const ACTION_WORD = /\s*[;|]?\s*\b(?:fix|report)\s*$/;
const FIXER_MARK = /\s*[|;]?\s*\b(fixed|reported:\s*(.*\S))\s*$/;

export function fixerMark(line) {
  const match = FIXER_MARK.exec(line);
  if (match === null) return null;
  if (match[1] === 'fixed') return { state: 'fixed', reason: null };
  return { state: 'reported', reason: match[2] };
}

export function withoutFixerMark(line) {
  return line.replace(FIXER_MARK, '');
}

const withoutAction = (line) => withoutFixerMark(line).replace(ACTION_WORD, '');

export function findingsDigest(text) {
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !/^\s/.test(line) && !line.startsWith('FAIL '));
  return createHash('sha256').update(lines.map(withoutAction).join('\n')).digest('hex');
}
