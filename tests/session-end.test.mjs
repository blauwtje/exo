import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const hook = path.resolve('hooks/session-end.mjs');
const DAY_SECONDS = 24 * 60 * 60;

function repository(branch = 'topic') {
  const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'session-end-')));
  const git = (...args) => spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', branch);
  git('commit', '-q', '--allow-empty', '-m', 'start');
  const handoff = path.join(cwd, '.git', 'exo', 'handoff', `${branch}.md`);
  return { cwd, handoff };
}

function endSession(cwd, extra = {}) {
  const env = { ...process.env };
  delete env.EXO_RUN_DIR;
  delete env.TE_SIDECALL;
  const input = JSON.stringify({ hook_event_name: 'SessionEnd', cwd, ...extra });
  return spawnSync('node', [hook], { input, encoding: 'utf8', env });
}

function ageFile(file, days) {
  const seconds = Date.now() / 1000 - days * DAY_SECONDS;
  fs.utimesSync(file, seconds, seconds);
}

function putHandoff(handoff, text) {
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, text);
}

test('a session that wrote no handoff leaves a stub with dirty files, the progress path and a Resume line', () => {
  const { cwd, handoff } = repository();
  fs.writeFileSync(path.join(cwd, 'draft.txt'), 'x');
  const progress = path.join(cwd, '.exo', 'plan-a', 'progress.md');
  fs.mkdirSync(path.dirname(progress), { recursive: true });
  fs.writeFileSync(progress, 'step');
  const result = endSession(cwd);
  assert.equal(result.status, 0, result.stderr);
  const lines = fs.readFileSync(handoff, 'utf8').trimEnd().split('\n');
  assert.match(lines.find((line) => line.startsWith('Written: ')), /^Written: \d{4}-\d{2}-\d{2}, HEAD [0-9a-f]{7,}, branch topic$/);
  assert.ok(lines.includes('Source: auto'));
  assert.ok(lines.some((line) => line.includes('draft.txt')));
  assert.ok(lines.includes(`Progress file: ${progress}`));
  assert.equal(lines.at(-1), `Resume: read ${handoff} and continue the work`);
});

test('a handoff without a Source: auto line stays untouched', () => {
  const { cwd, handoff } = repository();
  putHandoff(handoff, '# Handoff\n\nResume: lees dit\n');
  ageFile(handoff, 3);
  endSession(cwd);
  assert.equal(fs.readFileSync(handoff, 'utf8'), '# Handoff\n\nResume: lees dit\n');
});

test('an auto stub from an earlier session is refreshed', () => {
  const { cwd, handoff } = repository();
  putHandoff(handoff, '# Handoff\n\nSource: auto\nstale-line\n');
  ageFile(handoff, 3);
  const transcript = path.join(cwd, 'transcript.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'summary' })}\n${JSON.stringify({ timestamp: new Date().toISOString() })}\n`);
  endSession(cwd, { transcript_path: transcript });
  const text = fs.readFileSync(handoff, 'utf8');
  assert.ok(!text.includes('stale-line'));
  assert.ok(text.includes('Source: auto'));
});

test('an auto stub written after the session began is kept', () => {
  const { cwd, handoff } = repository();
  putHandoff(handoff, '# Handoff\n\nSource: auto\nkept-line\n');
  const transcript = path.join(cwd, 'transcript.jsonl');
  const began = new Date(Date.now() - DAY_SECONDS * 1000).toISOString();
  fs.writeFileSync(transcript, `${JSON.stringify({ timestamp: began })}\n`);
  endSession(cwd, { transcript_path: transcript });
  assert.ok(fs.readFileSync(handoff, 'utf8').includes('kept-line'));
});

test('a clean repository with no progress file gets no stub', () => {
  const { cwd, handoff } = repository();
  const result = endSession(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(handoff));
});

test('a directory outside a git repository gets no stub', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'session-end-home-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'session-end-plain-'));
  fs.writeFileSync(path.join(cwd, 'draft.txt'), 'x');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: home };
  delete env.EXO_RUN_DIR;
  delete env.TE_SIDECALL;
  spawnSync('node', [hook], { input: JSON.stringify({ cwd }), encoding: 'utf8', env });
  assert.deepEqual(fs.readdirSync(home), []);
});

test('unreadable hook input still exits 0', () => {
  const env = { ...process.env };
  delete env.EXO_RUN_DIR;
  delete env.TE_SIDECALL;
  const result = spawnSync('node', [hook], { input: 'not json', encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
});

test('a branch name with a slash gets its parent folders', () => {
  const { cwd, handoff } = repository('feat/x');
  fs.writeFileSync(path.join(cwd, 'draft.txt'), 'x');
  endSession(cwd);
  assert.ok(fs.existsSync(handoff));
});
