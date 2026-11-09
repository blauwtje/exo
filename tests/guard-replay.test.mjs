import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'guard-replay.mjs');
const ROOT = path.resolve(path.dirname(SCRIPT), '..');
const DENY_TEXT = 'Subagents share the stash with every worktree, so git stash is denied';

const record = (entrypoint, time, content) => JSON.stringify({ entrypoint, timestamp: time, message: { content } });
const use = (id, name, input) => ({ type: 'tool_use', id, name, input });
const refusal = (id, text) => ({ type: 'tool_result', tool_use_id: id, is_error: true, content: text });

const session = (entrypoint) => [
  record(entrypoint, '2026-11-06T10:00:00Z', [use('a', 'Bash', { command: 'git stash' })]),
  record(entrypoint, '2026-11-06T10:00:01Z', [refusal('a', DENY_TEXT)])
].join('\n');

function fixture(root) {
  const dir = path.join(root, 'projects', 'proj');
  fs.mkdirSync(path.join(dir, 'sid', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sid', 'subagents', 'w.jsonl'), session('cli'));
  fs.writeFileSync(path.join(dir, 'sdk.jsonl'), session('sdk-cli'));
  fs.writeFileSync(path.join(dir, 'lead.jsonl'), session('cli'));
  return path.join(root, 'projects');
}

test('replays unique cli subagent refusals through base and candidate trees', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-replay-test-'));
  const corpus = path.join(root, 'corpus.json');
  const args = [SCRIPT, '--family', 'stash', '--projects', fixture(root), '--corpus', corpus, '--base', ROOT, '--candidate', ROOT];
  const run = spawnSync('node', args, { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  const saved = JSON.parse(fs.readFileSync(corpus, 'utf8'));
  assert.deepEqual(saved.stash.inputs, [{ command: 'git stash' }]);
  assert.match(run.stdout, /stash: firstLive=2026-11-06T10:00:00Z unique=1/);
  assert.match(run.stdout, /base +deny=\d+ rewrite=\d+ pass=\d+ error=0/);
  assert.match(run.stdout, /candidate +deny=\d+ rewrite=\d+ pass=\d+ error=0/);
});

test('rejects an unknown family', () => {
  const run = spawnSync('node', [SCRIPT, '--family', 'nope', '--projects', os.tmpdir()], { encoding: 'utf8', timeout: 30000 });
  assert.notEqual(run.status, 0);
});
