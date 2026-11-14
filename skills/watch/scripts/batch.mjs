import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '#basics';
import { environmentMs } from '#script-flags';
import { classifyOutsideFailure } from '../../../lib/outside-limit.mjs';
import { sourceOf } from './video-url.mjs';
import { DEFAULTS } from './defaults.mjs';
import { prefetchTikTok } from './tiktok.mjs';
import { watchGuarded } from './watch.mjs';
import { findDone, markDone } from './done-ledger.mjs';
import { writeMerged } from './outputs.mjs';

function keyOf(input) {
  const source = sourceOf(input);
  return source?.id ?? source?.url ?? null;
}

function doneOf(input, options) {
  const key = keyOf(input);
  return key && !options.force ? findDone(options.out, key) : null;
}

async function runOne(input, options, fetchFn) {
  const key = keyOf(input);
  const done = doneOf(input, options);
  if (done) return { status: 'skipped', line: `skipped ${done.line}` };
  const result = await watchGuarded(input, options, fetchFn);
  if (result.failure) return { status: 'failed', failure: result.failure };
  if (key && result.transcript) markDone(options.out, key, result);
  return { status: 'done', line: result.line };
}

function note(message) {
  console.error(`batch: ${message}`);
}

async function probeUntilOpen(input, options, fetchFn) {
  let backoffMs = Math.max(options.backoffMs, 1);
  let waitedMs = 0;
  let probe = 0;
  while (waitedMs < options.rateWaitMs) {
    probe += 1;
    note(`probe ${probe}, waited ${waitedMs} of ${options.rateWaitMs} ms`);
    const waitMs = Math.min(backoffMs, options.rateWaitMs - waitedMs);
    await sleep(waitMs);
    waitedMs += waitMs;
    backoffMs *= 2;
    const outcome = await runOne(input, options, fetchFn);
    if (!isRateLimited(outcome)) {
      note('resumed');
      return outcome;
    }
  }
  return null;
}

function isRateLimited(outcome) {
  return Boolean(outcome.failure) && classifyOutsideFailure({ text: outcome.failure }) === 'rate-limited';
}

async function tripAndProbe(input, options, fetchFn) {
  note(`rate-limited on ${input}, no further video starts`);
  return probeUntilOpen(input, options, fetchFn);
}

function isChunked(out, done) {
  return fs.existsSync(path.join(out, path.dirname(done.transcript), 'chunks'));
}

function mergeFinished(options) {
  const entries = options.urls.flatMap((input) => {
    const key = keyOf(input);
    const done = key ? findDone(options.out, key) : null;
    if (!done || isChunked(options.out, done)) return [];
    return [{ id: path.dirname(done.transcript), transcript: done.transcript }];
  });
  if (entries.length < 2) return;
  note(`merged transcripts ${writeMerged(options.out, entries)}`);
}

export async function watchBatch(batchOptions, report, fetchFn = globalThis.fetch) {
  const parallel = environmentMs('EXO_WATCH_PAGE_PARALLEL', DEFAULTS.pageParallel);
  const cutoff = new AbortController();
  const unread = batchOptions.urls.filter((input) => !doneOf(input, batchOptions));
  const options = { ...batchOptions, pageReads: prefetchTikTok(unread, { ...batchOptions, parallel, signal: cutoff.signal }, fetchFn) };
  const outcomes = [];
  const guarded = options.urls.length > 1;
  for (const [index, input] of options.urls.entries()) {
    let outcome = await runOne(input, options, fetchFn);
    if (guarded && isRateLimited(outcome)) {
      cutoff.abort();
      outcome = await tripAndProbe(input, options, fetchFn);
    }
    if (!outcome) {
      const open = options.urls.slice(index);
      const restart = options.restart(open);
      outcomes.push(...open.map(() => ({ status: 'open', restart })));
      mergeFinished(options);
      return outcomes;
    }
    outcomes.push(outcome);
    report(outcome);
  }
  mergeFinished(options);
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
  if (count('open') === 0) return [counts, ...failureGroups(outcomes)].join(' | ');
  return [`${counts} open=${count('open')}`, ...failureGroups(outcomes), 'rate-limited', `restart: ${outcomes.find((outcome) => outcome.restart).restart}`].join(' | ');
}

export function exitCodeOf(outcomes) {
  if (outcomes.some((outcome) => outcome.status === 'open')) return 75;
  return outcomes.every((outcome) => outcome.status === 'failed') ? 1 : 0;
}
