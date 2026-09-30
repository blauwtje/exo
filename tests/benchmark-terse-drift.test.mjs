// benchmarks/terse-drift.mjs is the live multi-turn harness for replies=terse.
// Its pure parts run here with no network: argument parsing, the 12-turn
// prompt list, the verdict on canned texts, the stream-json handling on a
// canned stdout, and the dry run, which exits 0 and starts no claude process.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scoreProse } from '#prose-density';
import { TURN_PROMPTS, claudeArguments, createTurnReader, dryRunLine, isCompactionEvent, modelId, parseArguments, processCause, rawTurnTexts, runReasons, sessionRecords, userMessageLine, verdictFor } from '../benchmarks/terse-drift.mjs';
import { MODELS } from '../benchmarks/tasks.mjs';
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

const GATED_TURNS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const GATED_TERSE = Object.fromEntries(GATED_TURNS.map((turn) => [turn, TERSE_TEXT]));

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

test('--effort takes one of the five levels, reaches claude as --effort, and passes nothing when omitted', () => {
  for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
    const args = claudeArguments(parseArguments(['--effort', effort]));
    assert.deepEqual(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2), ['--effort', effort]);
  }
  assert.equal(parseArguments([]).effort, null);
  assert.equal(claudeArguments(parseArguments([])).includes('--effort'), false);
  assert.throws(() => parseArguments(['--effort', 'extreme']), /unknown effort/);
  assert.throws(() => parseArguments(['--effort']), /unknown effort/);
});

test('--model takes a MODELS key or passes a full claude- id through unchanged', () => {
  assert.equal(modelId('opus'), MODELS.opus);
  assert.equal(modelId(parseArguments(['--model', 'claude-opus-5-5']).model), 'claude-opus-5-5');
  const args = claudeArguments(parseArguments(['--model', 'claude-opus-5-5']));
  assert.equal(args[args.indexOf('--model') + 1], 'claude-opus-5-5');
  assert.throws(() => parseArguments(['--model', 'opus-5-5']), /unknown model/);
});

test('the dry run names the model id and the effort it would run', () => {
  const line = dryRunLine(parseArguments(['--model', 'claude-opus-5-5', '--effort', 'high', '--runs', '3']));
  assert.match(line, /on claude-opus-5-5 at effort high/);
  assert.match(dryRunLine(parseArguments([])), new RegExp(`on ${MODELS.sonnet} at effort the CLI default`));
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

test('a full-prose gated turn fails, on every turn but the compact turn, the commit turn included', () => {
  for (const turn of GATED_TURNS) {
    const result = verdictFor(turnsWith({ ...GATED_TERSE, [turn]: FULL_TEXT }), COMMIT_BODY);
    assert.equal(result.verdict, 'FAIL', `turn ${turn}`);
  }
});

test('the compact turn is not gated', () => {
  const result = verdictFor(turnsWith({ ...GATED_TERSE, 7: FULL_TEXT }), COMMIT_BODY);
  assert.equal(result.verdict, 'PASS');
});

test('a terse commit body fails as a lost control', () => {
  const result = verdictFor(turnsWith(GATED_TERSE), TERSE_TEXT);
  assert.equal(result.verdict, 'FAIL');
});

test('a subject-only commit or a body under 20 words fails, even when a gated turn went unmeasured', () => {
  const subjectOnly = verdictFor(turnsWith(GATED_TERSE), '');
  assert.equal(subjectOnly.verdict, 'FAIL');
  assert.deepEqual(subjectOnly.reasons, ['commit body is empty']);
  const thin = verdictFor(turnsWith(GATED_TERSE), 'Adds a comment above allow.');
  assert.equal(thin.verdict, 'FAIL');
  assert.match(thin.reasons[0], /commit body has 5 words, under 20/);
  assert.equal(verdictFor(turnsWith({ 1: TERSE_TEXT }), '').verdict, 'FAIL');
});

test('a failed call, a short gated turn or a missing commit is UNRUN and names its cause', () => {
  const failedCall = verdictFor(turnsWith({ ...GATED_TERSE, 11: null }), COMMIT_BODY);
  assert.equal(failedCall.verdict, 'UNRUN');
  assert.deepEqual(failedCall.reasons, ['turn 11 has no reply']);
  const short = verdictFor(turnsWith({ ...GATED_TERSE, 10: 'Done.' }), COMMIT_BODY);
  assert.equal(short.verdict, 'UNRUN');
  assert.deepEqual(short.reasons, ['turn 10 has 1 words, under 25']);
  const noCommit = verdictFor(turnsWith(GATED_TERSE), null);
  assert.equal(noCommit.verdict, 'UNRUN');
  assert.deepEqual(noCommit.reasons, ['no commit landed']);
  assert.equal(noCommit.commit.score, null);
});

test('a run that ends UNRUN names the process cause, and a clean exit names none', () => {
  const clean = { exitCode: 0, signal: null, spawnError: null, timedOut: false };
  assert.equal(processCause(clean), null);
  assert.match(processCause({ ...clean, exitCode: null, spawnError: 'spawn claude ENOENT' }), /failed to start: spawn claude ENOENT/);
  assert.match(processCause({ ...clean, exitCode: null, signal: 'SIGKILL', timedOut: true }), /session timeout/);
  assert.match(processCause({ ...clean, exitCode: null, signal: 'SIGTERM' }), /signal SIGTERM/);
  assert.match(processCause({ ...clean, exitCode: 1 }), /exited 1; see stderr.log/);
  const unrun = verdictFor(turnsWith({}), null);
  const reasons = runReasons(unrun, { ...clean, exitCode: 1 }, 'the stream ended after 0 of 12 turns');
  assert.deepEqual(reasons.slice(0, 2), ['claude exited 1; see stderr.log', 'the stream ended after 0 of 12 turns']);
  const fail = verdictFor(turnsWith(GATED_TERSE), '');
  assert.deepEqual(runReasons(fail, { ...clean, exitCode: 1 }, null), ['commit body is empty']);
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
  assert.equal(failed.cause, 'turn 10 failed (error_max_budget_usd)');
  const short = sessionRecords(streamTurnsWith({}).slice(0, 9));
  assert.equal(short.complete, false);
  assert.equal(short.cause, 'the stream ended after 9 of 12 turns');
  assert.equal(short.turns[10].score, null);
  assert.equal(verdictFor(short.turns, null).verdict, 'UNRUN');
});

const promptEntry = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const replyEntry = (text) => ({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text }] } });
const toolUseEntry = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } };
const toolResultEntry = { type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } };

function transcriptOf(turnCount) {
  const entries = [];
  for (let turn = 1; turn <= turnCount; turn += 1) {
    entries.push(promptEntry(`prompt ${turn}`), toolUseEntry, toolResultEntry, replyEntry(`early ${turn}`), replyEntry(`raw ${turn}`));
    if (turn === 7) entries.push({ type: 'user', isCompactSummary: true, message: { content: 'summary' } }, promptEntry('<local-command-stdout>ok</local-command-stdout>'));
  }
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

test('raw turn texts take the last assistant text of each of 12 turns from the transcript', () => {
  const texts = rawTurnTexts(`${transcriptOf(12)}\nnot json`);
  assert.equal(texts.length, 12);
  assert.equal(texts[0], 'raw 1');
  assert.equal(texts[11], 'raw 12');
});

test('a transcript that does not split into 12 turns gives no raw text, and sessionRecords reports it as null', () => {
  assert.deepEqual(rawTurnTexts(transcriptOf(11)), TURN_PROMPTS.map(() => null));
  assert.deepEqual(rawTurnTexts(''), TURN_PROMPTS.map(() => null));
  const missing = sessionRecords(streamTurnsWith({}));
  assert.equal(missing.turns[0].raw, null);
  assert.equal(missing.turns[0].rawScore, null);
});

test('raw text is scored beside the shown text and never gates', () => {
  const raw = TURN_PROMPTS.map(() => FULL_TEXT);
  const records = sessionRecords(streamTurnsWith({}), raw);
  assert.equal(records.turns[0].raw, FULL_TEXT);
  assert.ok(records.turns[0].rawScore.articleRate > records.turns[0].score.articleRate);
  assert.equal(records.turns[6].rawScore, null);
  assert.equal(verdictFor(records.turns, COMMIT_BODY).verdict, 'PASS');
});
