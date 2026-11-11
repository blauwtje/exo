import { RUN_OUTCOMES, outcomeLine } from './run-outcomes.mjs';

const GATE_KINDS = new Set(['gate fail', 'repair bound', 'fix discarded', 'review budget', 'question', 'blocked', 'findings', 'recurring finding', 'unread file', 'probe', 'no verdict']);
const RETRYABLE = new Set(['plan drift', 'outside Files', 'report missing', 'proof failed']);

export const REFUSAL_HANDLERS = Object.fromEntries(
  Object.keys(RUN_OUTCOMES)
    .filter((kind) => !GATE_KINDS.has(kind))
    .map((kind) => [kind, { retry: RETRYABLE.has(kind), get then() { return outcomeLine(kind); } }])
);

export function refusalHandler(kind) {
  const row = REFUSAL_HANDLERS[kind];
  if (row === undefined) throw new Error(`no refusal handler for '${kind}'`);
  return row.then;
}

export function isRetryable(kind) {
  refusalHandler(kind);
  return REFUSAL_HANDLERS[kind].retry;
}

export function refusalTail(kind) {
  return `${refusalHandler(kind)}\n${isRetryable(kind) ? 'exo-retry\n' : ''}`;
}
