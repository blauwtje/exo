import { outcome, outcomeLine } from '../../../lib/run-outcomes.mjs';

export function decide(label, kind) {
  return `DECIDE ${label} ${outcome(kind).action}: ${outcomeLine(kind)}`;
}

export function stopLine() {
  return `STOP ${outcome('repair bound').kind.replace(' ', '-')}: ${outcomeLine('repair bound')}`;
}

const BLOCKED_CLEARS = [
  [/^UNREAD-FILE\b/, 'unread file'],
  [/^BLOCKED: report missing/, 'report missing'],
  [/^BLOCKED recurring\b/, 'recurring finding']
];

export function blockedNext(body) {
  const kinds = BLOCKED_CLEARS.filter(([pattern]) => body.some((line) => pattern.test(line))).map(([, kind]) => outcomeLine(kind));
  return `NEXT the merged review is blocked; dispatch nothing until it clears: ${kinds.join('; ') || 'rerun the reviewers that did not finish, then merge again'}`;
}
