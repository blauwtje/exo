import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepository, run, tempDir } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/diagnose/scripts/dispatch-prep.mjs', import.meta.url));
const SYMPTOM = 'The Export Test fails since yesterday, and the last row is dropped when the file has more than ten thousand rows in it';

async function prep(args) {
  const root = await gitRepository({ 'a.txt': '0' });
  const result = await run(SCRIPT, args, { cwd: root });
  return { ...result, root };
}

test('the report path holds a slug of at most 40 characters', async () => {
  const { stdout, code } = await prep(['--symptom', SYMPTOM]);
  assert.equal(code, 0);
  const line = stdout.split('\n')[0];
  assert.match(line, /^Report: .*\/debug\/[a-z0-9-]+\.md$/);
  assert.ok(path.basename(line, '.md').length <= 40);
  assert.ok(path.basename(line, '.md').startsWith('the-export-test-fails'));
});

test('the investigator prompt holds the symptom and the First bad line of the bisect file', async () => {
  const folder = tempDir();
  const bisect = path.join(folder, 'bisect.txt');
  fs.writeFileSync(bisect, 'First bad: abc1234 feat: breaks it\nGood: 1234567\nFiles:\na.txt\n');
  const { stdout, root } = await prep(['--symptom', SYMPTOM, '--bisect', bisect]);
  assert.ok(stdout.includes(`Symptom: ${SYMPTOM}`));
  assert.match(stdout, /^First bad: abc1234 feat: breaks it$/m);
  assert.doesNotMatch(stdout, /Good: 1234567/);
  assert.ok(stdout.includes(`repository ${fs.realpathSync(root)}`));
  assert.doesNotMatch(stdout, /<(root|abs path|skill dir|handoff path|one line)>/);
});

test('with no bisect file First bad is none', async () => {
  const { stdout } = await prep(['--symptom', SYMPTOM]);
  assert.match(stdout, /^First bad: none$/m);
});

test('with a handoff the fixer prompt holds the root, the worktree and the handoff path', async () => {
  const { stdout, root } = await prep(['--symptom', SYMPTOM, '--handoff', '/tmp/handoff.md']);
  assert.match(stdout, /^Reads: \/tmp\/handoff\.md$/m);
  assert.ok(stdout.includes(`repository ${fs.realpathSync(root)}, worktree ${fs.realpathSync(root)}`));
  assert.doesNotMatch(stdout, /Investigate the symptom/);
  assert.doesNotMatch(stdout, /<(root|abs path|skill dir|handoff path|one line)>/);
});
