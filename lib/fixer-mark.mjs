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
