import path from 'node:path';
import { RUN_OUTCOMES, outcomeLine } from './run-outcomes.mjs';
import { decide, formatLine, recordRound } from './loop-budget.mjs';
import { allViolations } from './refusal-rules.mjs';

const GATE_KINDS = new Set(['gate fail', 'repair bound', 'fix discarded', 'review budget', 'question', 'blocked', 'findings', 'recurring finding', 'unread file', 'probe', 'no verdict', 'rounds-spent', 'no-progress']);
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

export function landRefusal(runDir, task, checks, context) {
  const taskDir = path.join(runDir, `task-${task}`);
  const violations = allViolations(checks, context);
  if (violations.length === 0) return null;
  const decision = decide(taskDir, 'refusal');
  const names = violations.map((found) => found.id).join(', ');
  if (decision.verdict === 'STOP') return `${formatLine('refusal', decision)}: ${names}\n`;
  recordRound(taskDir, { kind: 'refusal', openAfter: violations.length });
  const lines = violations.map((found) => found.text);
  return `${lines.join('\n')}\n${formatLine('refusal', decision)}\n`;
}
