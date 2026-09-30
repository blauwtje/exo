// benchmarks/terse-drift.mjs is the live multi-turn harness for replies=terse.
// Its pure parts run here with no network: argument parsing, the 12-turn
// prompt list, the verdict on canned texts, the stream-json handling on a
// canned stdout, and the dry run, which exits 0 and starts no claude process.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scoreProse } from '../benchmarks/prose-density.mjs';
import { TURN_PROMPTS, createTurnReader, isCompactionEvent, parseArguments, sessionRecords, userMessageLine, verdictFor } from '../benchmarks/terse-drift.mjs';
import { fixture, run } from './harness.mjs';

const HARNESS = fileURLToPath(new URL('../benchmarks/terse-drift.mjs', import.meta.url));

const TERSE_TEXT = 'Limiter keeps timestamps per client. Request arrives: allow drops entries older than window, checks count against limit. Under limit: allow request, append current time. Next call sees accurate count. Clock skew shows as negative ages; entries never expire.';
const FULL_TEXT = 'The limiter keeps a list of timestamps for each client. When a request arrives, the function drops the entries that are older than the window and then checks whether the count is below the limit. If it is, the request is allowed and the current time is added to the list, so the next call sees an accurate count.';
const COMMIT_BODY = 'The comment explains what the method does for a reader. It also records that the check is a plain counter, which is the behaviour the tests rely on. A later change to the window will need the comment updated with it.';

function turnsWith(texts) {
  return TURN_PROMPTS.map((prompt, index) => {
    const text = texts[index + 1] ?? null;
    return { turn: index + 1, prompt, text, score: text === null ? null : scoreProse(text) };
  });
}

const GATED_TERSE = { 1: TERSE_TEXT, 10: TERSE_TEXT, 11: TERSE_TEXT };

test('arguments default to one terse sonnet run of this repository', () => {
  const options = parseArguments([]);
  assert.equal(options.level, 'terse');
  assert.equal(options.model, 'sonnet');
  assert.equal(options.runs, 1);
  assert.equal(options.concurrency, 1);
  assert.equal(options.confirm, false);
  assert.equal(path.basename(options.pluginDir), path.basename(path.resolve(fileURLToPath(new URL('..', import.meta.url)))));
});

test('arguments read every flag and reject unknown ones', () => {
  const options = parseArguments(['--plugin-dir', '/tmp/old', '--level', 'tight', '--model', 'opus', '--runs', '3', '--out', 'x', '--confirm']);
  assert.equal(options.pluginDir, '/tmp/old');
  assert.equal(options.level, 'tight');
  assert.equal(options.model, 'opus');
  assert.equal(options.runs, 3);
  assert.equal(options.concurrency, 3);
  assert.equal(options.out, 'x');
  assert.equal(options.confirm, true);
  assert.throws(() => parseArguments(['--nope']), /unknown flag/);
  assert.throws(() => parseArguments(['--model', 'gpt']), /unknown model/);
  assert.throws(() => parseArguments(['--runs', '0']), /--runs/);
});

test('the prompt list holds 12 turns with /compact at 7 and the commit at 12', () => {
  assert.equal(TURN_PROMPTS.length, 12);
  assert.equal(TURN_PROMPTS[6], '/compact');
  assert.match(TURN_PROMPTS[11], /commit/);
  assert.equal(TURN_PROMPTS.filter((prompt) => prompt === '/compact').length, 1);
});

test('terse gated turns and a full-prose commit body pass', () => {
  const result = verdictFor(turnsWith(GATED_TERSE), COMMIT_BODY);
  assert.equal(result.verdict, 'PASS');
  assert.ok(result.commit.score.articleRate >= 3.0);
});

test('a full-prose gated turn fails, on any of turns 1, 10 and 11', () => {
  for (const turn of [1, 10, 11]) {
    const result = verdictFor(turnsWith({ ...GATED_TERSE, [turn]: FULL_TEXT }), COMMIT_BODY);
    assert.equal(result.verdict, 'FAIL', `turn ${turn}`);
  }
});

test('a drift outside the gated turns is reported, not gated', () => {
  const result = verdictFor(turnsWith({ ...GATED_TERSE, 5: FULL_TEXT }), COMMIT_BODY);
  assert.equal(result.verdict, 'PASS');
});

test('a terse commit body fails as a lost control', () => {
  const result = verdictFor(turnsWith(GATED_TERSE), TERSE_TEXT);
  assert.equal(result.verdict, 'FAIL');
});

test('a failed call, a short gated turn or a missing commit is UNRUN', () => {
  assert.equal(verdictFor(turnsWith({ 1: TERSE_TEXT, 10: TERSE_TEXT }), COMMIT_BODY).verdict, 'UNRUN');
  assert.equal(verdictFor(turnsWith({ ...GATED_TERSE, 10: 'Done.' }), COMMIT_BODY).verdict, 'UNRUN');
  const noCommit = verdictFor(turnsWith(GATED_TERSE), null);
  assert.equal(noCommit.verdict, 'UNRUN');
  assert.equal(noCommit.commit.score, null);
});

test('without --confirm the harness exits 0, prints its call count and starts no claude process', async () => {
  const bin = await fixture();
  const marker = path.join(bin, 'called');
  await fs.writeFile(path.join(bin, 'claude'), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
  const result = await run(HARNESS, ['--runs', '2'], { env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^2 claude -p session\(s\) planned, each one process of 12 turns \(24 turns in all\)/);
  assert.match(result.stdout, /Re-run with --confirm/);
  await assert.rejects(fs.access(marker));
});

test('a user message line is one newline-terminated stream-json user event', () => {
  const prompt = 'Explain "allow"\nstep by step.';
  const line = userMessageLine(prompt);
  assert.ok(line.endsWith('\n'));
  assert.equal(line.indexOf('\n'), line.length - 1);
  assert.deepEqual(JSON.parse(line), { type: 'user', message: { role: 'user', content: prompt } });
});

const INIT = { type: 'system', subtype: 'init', session_id: 's' };
const COMPACT_BOUNDARY = { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } };
const resultEvent = (text) => ({ type: 'result', subtype: 'success', is_error: false, result: text });

function streamOf(events) {
  return events.map((event) => `${JSON.stringify(event)}\n`).join('');
}

function readTurns(stdout, chunkSize) {
  const streamTurns = [];
  const reader = createTurnReader((streamTurn) => streamTurns.push(streamTurn));
  for (let offset = 0; offset < stdout.length; offset += chunkSize) reader.push(stdout.slice(offset, offset + chunkSize));
  return streamTurns;
}

test('the turn reader splits a canned stream into one turn per result, across any chunk cut', () => {
  const stdout = streamOf([
    INIT, { type: 'assistant', message: { content: [] } }, resultEvent('first'),
    { type: 'system', subtype: 'status', status: 'compacting' }, COMPACT_BOUNDARY, resultEvent('')
  ]);
  for (const chunkSize of [1, 7, stdout.length]) {
    const streamTurns = readTurns(stdout, chunkSize);
    assert.equal(streamTurns.length, 2, `chunk ${chunkSize}`);
    assert.equal(streamTurns[0].result.result, 'first');
    assert.equal(streamTurns[0].events.length, 3);
    assert.deepEqual(streamTurns[1].events.at(-1), resultEvent(''));
    assert.equal(streamTurns[0].events.some(isCompactionEvent), false);
    assert.equal(streamTurns[1].events.some(isCompactionEvent), true);
  }
});

test('the turn reader holds a trailing partial line and keeps a non-JSON line as an unparsed event', () => {
  const streamTurns = readTurns(`not json\n${streamOf([resultEvent('done')])}{"type":"assist`, 5);
  assert.equal(streamTurns.length, 1);
  assert.deepEqual(streamTurns[0].events[0], { type: 'unparsed', line: 'not json' });
});

test('only a system compact_boundary event counts as a compaction', () => {
  assert.equal(isCompactionEvent(COMPACT_BOUNDARY), true);
  assert.equal(isCompactionEvent({ type: 'system', subtype: 'status', status: 'compacting' }), false);
  assert.equal(isCompactionEvent({ type: 'user', subtype: 'compact_boundary' }), false);
});

function streamTurnsWith(overrides) {
  return TURN_PROMPTS.map((_, index) => {
    const turn = index + 1;
    const events = turn === 7 ? [COMPACT_BOUNDARY] : [];
    return overrides[turn] ?? { events: [...events, resultEvent(TERSE_TEXT)], result: resultEvent(TERSE_TEXT) };
  });
}

test('a full streamed session is complete, confirms compaction at turn 7 and scores every chat turn', () => {
  const records = sessionRecords(streamTurnsWith({}));
  assert.equal(records.complete, true);
  assert.equal(records.compaction, 'confirmed');
  assert.equal(records.turns.length, 12);
  assert.equal(records.turns[6].score, null);
  assert.equal(records.turns[0].text, TERSE_TEXT);
  assert.ok(records.turns[0].score.words >= 25);
});

test('a missing compaction event, a failed turn or a short stream never counts as confirmed or complete', () => {
  const plain = { events: [resultEvent('')], result: resultEvent('') };
  assert.equal(sessionRecords(streamTurnsWith({ 7: plain })).compaction, 'UNRUN');
  const boundaryElsewhere = streamTurnsWith({ 7: plain, 6: { events: [COMPACT_BOUNDARY, resultEvent(TERSE_TEXT)], result: resultEvent(TERSE_TEXT) } });
  assert.equal(sessionRecords(boundaryElsewhere).compaction, 'UNRUN');
  const budget = { type: 'result', subtype: 'error_max_budget_usd', is_error: false };
  const failed = sessionRecords(streamTurnsWith({ 10: { events: [budget], result: budget } }));
  assert.equal(failed.complete, false);
  assert.equal(failed.turns[9].text, null);
  const short = sessionRecords(streamTurnsWith({}).slice(0, 9));
  assert.equal(short.complete, false);
  assert.equal(short.turns[10].score, null);
  assert.equal(verdictFor(short.turns, null).verdict, 'UNRUN');
});
