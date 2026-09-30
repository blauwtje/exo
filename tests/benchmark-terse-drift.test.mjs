// benchmarks/terse-drift.mjs is the live multi-turn harness for replies=terse.
// Its pure parts run here with no network: argument parsing, the 12-turn
// prompt list, the verdict on canned texts, and the dry run, which exits 0
// and starts no claude process.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scoreProse } from '../benchmarks/prose-density.mjs';
import { TURN_PROMPTS, parseArguments, verdictFor } from '../benchmarks/terse-drift.mjs';
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
  assert.match(result.stdout, /^24 claude -p calls planned/);
  assert.match(result.stdout, /Re-run with --confirm/);
  await assert.rejects(fs.access(marker));
});
