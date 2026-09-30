// The per-session terse feedback state: one `{ expand, feedback }` JSON file per
// session under `<configDirectory()>/exo/terse/`, deleted once both are empty,
// and the scoring that turns a reply into the `{ rate, sentence }` feedback.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, test } from 'node:test';
import {
  ARTICLE_LIMIT,
  clearTerseState,
  feedbackFor,
  readTerseState,
  terseStateFile,
  tightenSentence,
  writeTerseState,
} from '#terse-feedback';

let configDir;
let savedConfigDir;

beforeEach(() => {
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-terse-'));
  process.env.CLAUDE_CONFIG_DIR = configDir;
});

afterEach(() => {
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  fs.rmSync(configDir, { recursive: true, force: true });
});

test('the state file lives under the config directory, one per session', () => {
  assert.equal(terseStateFile('abc-1'), path.join(configDir, 'exo', 'terse', 'abc-1.json'));
  assert.throws(() => terseStateFile('../escape'), /invalid session id/);
});

test('a session with no file reads as empty state', () => {
  assert.deepEqual(readTerseState('abc-1'), { expand: false, feedback: null, display: null });
});

test('written state reads back, with feedback a { rate, sentence } object', () => {
  const feedback = { rate: 6.4, sentence: 'build fails.' };
  writeTerseState('abc-1', { expand: false, feedback });
  assert.deepEqual(readTerseState('abc-1'), { expand: false, feedback, display: null });
  assert.deepEqual(JSON.parse(fs.readFileSync(terseStateFile('abc-1'), 'utf8')), {
    expand: false,
    feedback,
  });
});

test('display state reads back and is written only when set', () => {
  const display = { messageId: 'm1', inFence: true };
  writeTerseState('abc-1', { expand: false, feedback: null, display });
  assert.deepEqual(readTerseState('abc-1'), { expand: false, feedback: null, display });
  assert.deepEqual(JSON.parse(fs.readFileSync(terseStateFile('abc-1'), 'utf8')), { expand: false, feedback: null, display });
  writeTerseState('abc-1', { expand: false, feedback: null });
  assert.equal(fs.existsSync(terseStateFile('abc-1')), false);
});

test('a misshapen display reads as null and keeps the rest of the state', () => {
  fs.mkdirSync(path.dirname(terseStateFile('abc-1')), { recursive: true });
  fs.writeFileSync(terseStateFile('abc-1'), JSON.stringify({ expand: true, feedback: null, display: { messageId: 7 } }));
  assert.deepEqual(readTerseState('abc-1'), { expand: true, feedback: null, display: null });
});

test('state with expand false and no feedback deletes the file', () => {
  writeTerseState('abc-1', { expand: true, feedback: null });
  assert.ok(fs.existsSync(terseStateFile('abc-1')));
  writeTerseState('abc-1', { expand: false, feedback: null, display: null });
  assert.equal(fs.existsSync(terseStateFile('abc-1')), false);
});

test('clearTerseState on a missing file is not an error', () => {
  clearTerseState('abc-1');
  writeTerseState('abc-1', { expand: true, feedback: null });
  clearTerseState('abc-1');
  assert.equal(fs.existsSync(terseStateFile('abc-1')), false);
});

test('an invalid session id writes nothing and reads as empty', () => {
  writeTerseState('../escape', { expand: true, feedback: null });
  assert.equal(fs.existsSync(path.join(configDir, 'exo')), false);
  assert.deepEqual(readTerseState('../escape'), { expand: false, feedback: null, display: null });
});

test('a malformed or misshapen file reads as empty state', () => {
  fs.mkdirSync(path.dirname(terseStateFile('abc-1')), { recursive: true });
  fs.writeFileSync(terseStateFile('abc-1'), '{not json');
  assert.deepEqual(readTerseState('abc-1'), { expand: false, feedback: null, display: null });
  fs.writeFileSync(terseStateFile('abc-1'), JSON.stringify({ expand: 'yes', feedback: { rate: 'x' } }));
  assert.deepEqual(readTerseState('abc-1'), { expand: false, feedback: null, display: null });
});

test('tightenSentence takes the first sentence with an article and drops its articles', () => {
  const text = 'Build failed. The test fails because of a typo in the parser. The end.';
  assert.equal(tightenSentence(text), 'test fails because of typo in parser.');
});

test('tightenSentence ignores code, quotes and paths when picking the sentence', () => {
  const text = 'Run `the thing` now. See "the docs" and lib/the-file.mjs now. Then check the log.';
  assert.equal(tightenSentence(text), 'Then check log.');
});

test('tightenSentence cuts to 120 characters and marks the cut', () => {
  const text = `The ${'word '.repeat(60)}ends.`;
  const sentence = tightenSentence(text);
  assert.equal(sentence.length, 120);
  assert.ok(sentence.endsWith('…'));
});

test('tightenSentence returns null when no sentence holds an article', () => {
  assert.equal(tightenSentence('Build failed. Fix parser.'), null);
});

test('feedbackFor returns the rate and sentence over the limit', () => {
  assert.equal(ARTICLE_LIMIT, 2.0);
  const text = 'The build is broken because the parser reads the wrong file and the cache holds a stale copy of the output.';
  const feedback = feedbackFor(text);
  assert.ok(feedback.rate > ARTICLE_LIMIT);
  assert.equal(
    feedback.sentence,
    'build is broken because parser reads wrong file and cache holds stale copy of output.',
  );
});

test('feedbackFor returns null at or under the limit', () => {
  assert.equal(feedbackFor('Parser reads wrong file. Cache holds stale copy. Fix both, rerun tests.'), null);
  const atLimit = `The ${'word '.repeat(48)}end.`;
  assert.equal(feedbackFor(atLimit), null);
});
