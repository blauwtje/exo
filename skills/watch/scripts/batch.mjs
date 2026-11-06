import { sourceOf } from './video-url.mjs';
import { watchGuarded } from './watch.mjs';
import { findDone, markDone } from './done-ledger.mjs';

function keyOf(input) {
  const source = sourceOf(input);
  return source?.id ?? source?.url ?? null;
}

async function runOne(input, options, fetchFn) {
  const key = keyOf(input);
  const done = key && !options.force ? findDone(options.out, key) : null;
  if (done) return { status: 'skipped', line: `skipped ${done.line}` };
  const result = await watchGuarded(input, options, fetchFn);
  if (result.failure) return { status: 'failed', failure: result.failure };
  if (key && result.transcript) markDone(options.out, key, result);
  return { status: 'done', line: result.line };
}

export async function watchBatch(options, report, fetchFn = globalThis.fetch) {
  const outcomes = [];
  for (const input of options.urls) {
    const outcome = await runOne(input, options, fetchFn);
    outcomes.push(outcome);
    report(outcome);
  }
  return outcomes;
}

function splitFailure(failure) {
  const at = failure.indexOf(': ');
  return at < 0 ? { id: failure, reason: failure } : { id: failure.slice(0, at), reason: failure.slice(at + 2) };
}

function failureGroups(outcomes) {
  const groups = new Map();
  for (const { failure } of outcomes.filter((outcome) => outcome.failure)) {
    const { id, reason } = splitFailure(failure);
    groups.set(reason, [...(groups.get(reason) ?? []), id]);
  }
  return [...groups].map(([reason, ids]) => `${reason} (${ids.join(', ')})`);
}

export function summaryLine(outcomes) {
  const count = (status) => outcomes.filter((outcome) => outcome.status === status).length;
  const counts = `batch done=${count('done')} skipped=${count('skipped')} failed=${count('failed')}`;
  return [counts, ...failureGroups(outcomes)].join(' | ');
}

export function exitCodeOf(outcomes) {
  return outcomes.every((outcome) => outcome.status === 'failed') ? 1 : 0;
}
