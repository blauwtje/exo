import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkNotes, checkStamps } from '../skills/watch/scripts/check-stamps.mjs';
import { run, tempDir } from './harness.mjs';

const SCRIPT = path.resolve('skills/watch/scripts/check-stamps.mjs');
const ID = 'abcdefghijk';
const OTHER = 'zyxwvutsrqp';
const TRANSCRIPT = `[0:00](https://youtu.be/${ID}?t=0) first\n[0:30](https://youtu.be/${ID}?t=30) second\n[1:15](https://youtu.be/${ID}?t=75) third\n`;
const transcriptOf = (id) => (id === ID ? TRANSCRIPT : undefined);

test('a stamp on a line start is exact, whatever its label says', () => {
  const answer = `[wrong label](https://youtu.be/${ID}?t=30) and [x](https://www.youtube.com/watch?v=${ID}&t=75s)`;
  const result = checkStamps(answer, transcriptOf);
  assert.deepEqual([result.checked, result.exact, result.off, result.unchecked], [2, 2, 0, 0]);
});

test('a stamp between two lines is off and names the nearest line start', () => {
  const stamp = `[0:40](https://youtu.be/${ID}?t=40)`;
  const result = checkStamps(`see ${stamp}`, transcriptOf);
  assert.deepEqual([result.exact, result.off, result.unchecked], [0, 1, 0]);
  assert.deepEqual(result.offs, [{ stamp, nearest: 10 }]);
});

test('a missing transcript and a bare stamp are unchecked', () => {
  const answer = `[0:30](https://youtu.be/${OTHER}?t=30) and [02:15] and [1:02:03]`;
  const result = checkStamps(answer, transcriptOf);
  assert.deepEqual([result.checked, result.exact, result.off, result.unchecked], [3, 0, 0, 3]);
});

test('the script reads the kept transcript and exits 1 on an off stamp', async () => {
  const cwd = fs.realpathSync(tempDir('stamps-cwd-'));
  const temp = fs.realpathSync(tempDir('stamps-tmp-'));
  const store = fs.realpathSync(tempDir('stamps-store-'));
  const env = { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp, EXO_WATCH_STORE: store };
  const folder = path.join(store, ID);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'transcript.txt'), TRANSCRIPT);
  const good = path.join(cwd, 'good.md');
  const bad = path.join(cwd, 'bad.md');
  fs.writeFileSync(good, `[a](https://youtu.be/${ID}?t=30)\n`);
  fs.writeFileSync(bad, `[a](https://youtu.be/${ID}?t=30) [b](https://youtu.be/${ID}?t=40)\n`);
  const ok = await run(SCRIPT, ['--answer', good], { cwd, env });
  assert.equal(ok.code ?? 0, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), 'checked=1 exact=1 off=0 unchecked=0');
  const off = await run(SCRIPT, ['--answer', bad], { cwd, env });
  assert.equal(off.code, 1);
  assert.equal(off.stdout.trim(), `checked=2 exact=1 off=1 unchecked=0\noff: [b](https://youtu.be/${ID}?t=40) nearest=10`);
});

test('a call without --answer or --notes exits 2', async () => {
  const result = await run(SCRIPT, [], { cwd: tempDir('stamps-cwd-') });
  assert.equal(result.code, 2);
});

const QUOTED = `[0:00](https://youtu.be/${ID}?t=0) Hello, World! it is\n[0:30](https://youtu.be/${ID}?t=30) Dies ist ÜBER 3 Dinge\n[1:15](https://youtu.be/${ID}?t=75) last line\n`;
const quotedOf = (id) => (id === ID ? QUOTED : undefined);
const note = (second, quote) => `[x](https://youtu.be/${ID}?t=${second}) "${quote}" the point`;

test('a quote is matched after lowercasing and collapsing everything but letters and digits', () => {
  const text = [note(0, 'HELLO   world'), note(30, 'über 3-dinge')].join('\n');
  assert.deepEqual(checkNotes(text, quotedOf), { notes: 2, quoted: 2, drops: [] });
});

test('a quote may run into the next line of the transcript', () => {
  assert.equal(checkNotes(note(0, 'world it is dies ist'), quotedOf).quoted, 1);
});

test('a quote from the line after the next, an off stamp, no quote and a missing transcript are dropped', () => {
  const text = [
    note(0, 'last line'),
    note(40, 'dies ist'),
    `[x](https://youtu.be/${ID}?t=30) no quote here`,
    `[x](https://youtu.be/${OTHER}?t=30) "dies ist"`,
    'prose that is not a note "dies ist"',
    note(30, 'dies ist')
  ].join('\n');
  assert.deepEqual(checkNotes(text, quotedOf), { notes: 5, quoted: 1, drops: [1, 2, 3, 4] });
});

test('the script prints the counts and one drop line per file and line, and exits 1', async () => {
  const cwd = fs.realpathSync(tempDir('notes-cwd-'));
  const store = fs.realpathSync(tempDir('notes-store-'));
  const env = { ...process.env, EXO_WATCH_STORE: store };
  fs.mkdirSync(path.join(store, ID), { recursive: true });
  fs.writeFileSync(path.join(store, ID, 'transcript.txt'), QUOTED);
  const one = path.join(cwd, 'one.md');
  const two = path.join(cwd, 'two.md');
  fs.writeFileSync(one, `${note(30, 'dies ist')}\n`);
  fs.writeFileSync(two, `${note(30, 'dies ist')}\n${note(30, 'not there')}\n`);
  const ok = await run(SCRIPT, ['--notes', one], { cwd, env });
  assert.equal(ok.code ?? 0, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), `notes=1 quoted=1 dropped=0\nkeep: ${note(30, 'dies ist')}`);
  const dropped = await run(SCRIPT, ['--notes', one, '--notes', two], { cwd, env });
  assert.equal(dropped.code, 1);
  assert.equal(dropped.stdout.trim(), `notes=3 quoted=2 dropped=1\nkeep: ${note(30, 'dies ist')}\nkeep: ${note(30, 'dies ist')}\ndrop: ${two}:2`);
});
