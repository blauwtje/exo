import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { analysis, forkPrompt, prepareCheckpoint, runFork, verifyBlock, verifyPoint } from '../benchmarks/checkpoint-fork.mjs';
import { keepRepository } from '../benchmarks/sweep.mjs';
import { countsCost } from '../benchmarks/pricing.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'checkpoint-fork.mjs');
const BRANCH = 'feat/text-helpers';
const MODEL = 'claude-sonnet-5-5';
const at = (time) => `2026-01-01T${time}Z`;
const seconds = (time) => Date.parse(at(time)) / 1000;

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function commit(repository, file, time) {
  fs.writeFileSync(path.join(repository, file), `${file}\n`);
  git(repository, 'add', file);
  const date = at(time);
  execFileSync('git', ['-C', repository, 'commit', '--quiet', '-m', file], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
}

function touch(file, time) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x\n');
  fs.utimesSync(file, seconds(time), seconds(time));
}

function usageLine(id, time, output, extra = {}) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: at(time),
    message: { id, model: MODEL, usage: { input_tokens: 100, output_tokens: output, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }, content: [], ...extra }
  });
}

const VERIFY_CALL = { content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'exo:gate' } }] };

// A main transcript whose lead loads exo:gate at 00:15:00, with two subagents.
function writeTranscript(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const main = path.join(directory, 'session.jsonl');
  fs.writeFileSync(main, [
    usageLine('m1', '00:01:00', 50, { content: [{ type: 'text', text: 'wrote .exo/state.json' }] }),
    usageLine('m2', '00:15:00', 10, VERIFY_CALL),
    usageLine('m2', '00:15:00', 60, VERIFY_CALL),
    usageLine('m3', '00:16:00', 70)
  ].join('\n'));
  const agents = path.join(directory, 'session', 'subagents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'agent-a.jsonl'), `${usageLine('a1', '00:14:00', 5)}\n`);
  fs.writeFileSync(path.join(agents, 'agent-a.meta.json'), '{"agentType":"exo:build-task"}');
  fs.writeFileSync(path.join(agents, 'agent-b.jsonl'), `${usageLine('b1', '00:17:00', 90)}\n${usageLine('b2', '00:18:00', 20)}\n`);
  fs.writeFileSync(path.join(agents, 'agent-b.meta.json'), '{"agentType":"exo:fix-review"}');
  return main;
}

// A kept cell: three commits on the plan branch (the third after the verify call),
// .exo/ files written before and after it, a stray untracked file, a stale worktree.
function writeKeptCell(base) {
  const cellRoot = path.join(base, 'cell');
  const repository = path.join(cellRoot, 'repo');
  fs.mkdirSync(repository, { recursive: true });
  git(repository, 'init', '--quiet', '-b', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'test');
  commit(repository, 'base.txt', '00:00:00');
  git(repository, 'switch', '--quiet', '-c', BRANCH);
  commit(repository, 'one.txt', '00:05:00');
  commit(repository, 'two.txt', '00:10:00');
  commit(repository, 'fixed.txt', '00:20:00');
  fs.appendFileSync(path.join(repository, '.git', 'info', 'exclude'), '.exo/\n');
  touch(path.join(repository, '.exo', 'old.txt'), '00:05:00');
  touch(path.join(repository, '.exo', 'state.json'), '00:20:00');
  touch(path.join(repository, '.exo', 'verify-full.txt'), '00:20:00');
  touch(path.join(repository, '.exo', 'sub', 'late.md'), '00:20:00');
  fs.writeFileSync(path.join(repository, 'stray.txt'), 'stray\n');
  git(repository, 'worktree', 'add', '--quiet', '-b', 'other', path.join(cellRoot, 'gone'));
  fs.rmSync(path.join(cellRoot, 'gone'), { recursive: true });
  git(cellRoot, 'init', '--quiet', '--bare', 'origin.git');
  git(repository, 'remote', 'add', 'origin', path.join(base, 'deleted', 'origin.git'));
  return keepRepository(cellRoot, path.join(base, 'keep'), 'flow-unit-1');
}

test('verifyPoint finds the lead\'s first exo:gate call, and verifyBlock counts from there on', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fork-block-')));
  try {
    const main = writeTranscript(base);
    assert.equal(verifyPoint(main), Date.parse(at('00:15:00')));
    const block = verifyBlock(main);
    const call = (output) => countsCost({ input: 100, cacheRead: 1000, cache5m: 0, cache1h: 0, output }, MODEL);
    // m2 (last line wins), m3 and agent-b's two calls; m1 and agent-a come before the call.
    assert.ok(Math.abs(block.costUsd - (call(60) + call(70) + call(90) + call(20))) < 1e-12);
    assert.deepEqual(block.subagents, ['exo:fix-review']);
    assert.equal(block.fixLoop, true);
    assert.equal(block.wallMs, 3 * 60 * 1000);
    assert.equal(verifyPoint(path.join(base, 'session', 'subagents', 'agent-a.jsonl')), null);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('prepareCheckpoint rewinds the plan branch, keeps ignored .exo/ files from before the call and drops the rest', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fork-prepare-')));
  try {
    const kept = writeKeptCell(base);
    const forkRoot = path.join(base, 'fork');
    const result = prepareCheckpoint(kept, forkRoot, Date.parse(at('00:15:00')), { seenBefore: (relative) => relative === '.exo/state.json' });
    const repository = path.join(forkRoot, 'repo');
    assert.equal(git(repository, 'log', '-1', '--format=%s', BRANCH), 'two.txt');
    assert.equal(git(repository, 'rev-parse', 'HEAD'), result.sha);
    assert.equal(git(repository, 'branch', '--show-current'), BRANCH);
    assert.equal(git(repository, 'remote', 'get-url', 'origin'), path.join(forkRoot, 'origin.git'));
    assert.equal(git(repository, 'worktree', 'list').split('\n').length, 1, 'the stale worktree entry is pruned');
    assert.ok(!fs.existsSync(path.join(repository, 'fixed.txt')));
    assert.ok(!fs.existsSync(path.join(repository, 'stray.txt')), 'untracked files go');
    assert.ok(fs.existsSync(path.join(repository, '.exo', 'old.txt')), '.exo/ files from before the call stay');
    assert.deepEqual(fs.readdirSync(path.join(repository, '.exo')), ['old.txt']);
    assert.deepEqual(result.removed.sort(), ['state.json', 'sub/late.md', 'verify-full.txt']);
    assert.deepEqual(result.changed, ['state.json']);
    assert.equal(git(path.join(kept, 'repo'), 'log', '-1', '--format=%s', BRANCH), 'fixed.txt', 'the kept cell is untouched');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('runFork records a fork the way a sweep cell is recorded, from a fake session', async () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fork-run-')));
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    const kept = writeKeptCell(base);
    const fullTranscript = writeTranscript(path.join(base, 'full'));
    process.env.CLAUDE_CONFIG_DIR = path.join(base, 'config');
    const projects = path.join(base, 'config', 'projects', 'slug');
    fs.mkdirSync(projects, { recursive: true });
    const seen = [];
    const run = async (cell, workdir, cellRoot, cellDirectory) => {
      seen.push({ prompt: cell.prompt, cwd: workdir, plan: git(workdir, 'log', '-1', '--format=%s'), origin: git(workdir, 'remote', 'get-url', 'origin'), root: cellRoot });
      fs.copyFileSync(fullTranscript, path.join(projects, 'fork-session.jsonl'));
      fs.cpSync(path.join(path.dirname(fullTranscript), 'session'), path.join(projects, 'fork-session'), { recursive: true });
      fs.writeFileSync(path.join(cellDirectory, 'stdout.json'), JSON.stringify({ session_id: 'fork-session', total_cost_usd: 0.25 }));
      return { exitCode: 0, timedOut: false, wallMs: 4000 };
    };
    const forkDirectory = path.join(base, 'out', 'flow-unit-1-fork-1');
    const record = await runFork({ name: 'flow-unit-1', kept: path.join(base, 'keep', 'flow-unit-1'), fullTranscript, forkDirectory, run });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].prompt, forkPrompt());
    assert.equal(seen[0].plan, 'two.txt');
    assert.ok(seen[0].origin.startsWith(seen[0].root), 'origin points at the fork\'s own copy');
    assert.equal(record.costUsd, 0.25);
    assert.equal(record.fixLoop, true);
    assert.equal(record.hiddenPass, false);
    assert.deepEqual(record.changedExoFiles, ['state.json']);
    assert.ok(record.verifyCostUsd > 0 && record.verifyTokens > 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(forkDirectory, 'record.json'), 'utf8')), record);
    assert.ok(!fs.existsSync(seen[0].root), 'the fork root is removed');
    const lines = analysis([{ block: verifyBlock(fullTranscript), record: { costUsd: 1, hiddenPass: true } }], [record]);
    assert.match(lines[0], /^verify cost USD: full .* fork .* Mann-Whitney p=/);
    assert.match(lines[5], /^fork total cost 0\.250 \/ full cell cost 1\.000 = 0\.25$/);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('without --confirm the script lists the forks and starts none', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fork-cli-')));
  try {
    const run = spawnSync(process.execPath, [SCRIPT, '--checkpoints', path.join(base, 'keep'), '--full-runs', path.join(base, 'full'), '--out', path.join(base, 'out')], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 2);
    assert.match(run.stdout, /^0 verify-only forks planned/);
    assert.match(run.stdout, /Re-run with --confirm to start them/);
    const bad = spawnSync(process.execPath, [SCRIPT, '--out', base], { encoding: 'utf8', timeout: 60000 });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /name --full-runs/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
