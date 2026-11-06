import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { contextDecision } from '../lib/context-decisions.mjs';
import { agentContextTarget, contextLimit, softLimit } from '../lib/context-limits.mjs';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { git, run, tempDir } from './harness.mjs';
import { PLAN, SCRIPT, compactCheckout, landingCheckout, editApp } from './land-task-fixture.mjs';

const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'exo-checkpoint-home-'));
process.env.HOME = isolated;
process.env.GIT_CONFIG_GLOBAL = path.join(isolated, 'gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';

const AGENT_SOFT = softLimit(agentContextTarget()) + 1000;
const AGENT_HARD = Math.round(agentContextTarget() * 1.25) + 1000;
const LEAD_HARD = contextLimit() + 1000;
const CHECKPOINT = fileUrlPath('../skills/build/scripts/checkpoint.mjs');

function fileUrlPath(relative) {
  return new URL(relative, import.meta.url).pathname;
}

async function transcriptAt(tokens) {
  const file = path.join(tempDir('exo-checkpoint-transcript-'), 'session.jsonl');
  const line = { type: 'assistant', message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 } } };
  await fs.writeFile(file, `${JSON.stringify(line)}\n`);
  return file;
}

async function workerDecision(tokens, tool = 'Read', command = undefined) {
  const transcript_path = await transcriptAt(tokens);
  return contextDecision({ session_id: `s-${tokens}-${tool}`, agent_id: `a-${tokens}-${tool}-${Math.random()}`, agent_transcript_path: transcript_path, tool_name: tool, tool_input: { command } });
}

async function leadDecision(tokens, tool, command) {
  const transcript_path = await transcriptAt(tokens);
  process.env.EXO_RUN_HANDOFF = '/tmp/handoff.md';
  try {
    return contextDecision({ session_id: `l-${tokens}`, transcript_path, tool_name: tool, tool_input: { command } });
  } finally {
    delete process.env.EXO_RUN_HANDOFF;
  }
}

async function linkedWorktree() {
  const main = tempDir('exo-checkpoint-main-');
  git(main, 'init', '-q', '-b', 'main');
  git(main, 'config', 'user.name', 'exo-test');
  git(main, 'config', 'user.email', 'exo-test@example.com');
  git(main, 'config', 'commit.gpgsign', 'false');
  await fs.writeFile(path.join(main, 'a.txt'), 'one\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');
  const tree = path.join(tempDir('exo-checkpoint-tree-'), 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'work', tree);
  return { main, tree };
}

test('the soft and hard limit messages name the checkpoint command', async () => {
  const soft = await workerDecision(AGENT_SOFT);
  assert.match(soft?.additionalContext ?? '', /checkpoint\.mjs/);
  const hard = await workerDecision(AGENT_HARD, 'Read');
  assert.match(hard?.deny ?? '', /checkpoint\.mjs/);
  const lead = await leadDecision(LEAD_HARD, 'Read');
  assert.match(lead?.deny ?? '', /checkpoint\.mjs/);
});

test('the hard limit allows the checkpoint command and still denies other Bash', async () => {
  const command = `node ${CHECKPOINT}`;
  assert.equal(await workerDecision(AGENT_HARD, 'Bash', command), null);
  assert.match((await workerDecision(AGENT_HARD, 'Bash', 'ls'))?.deny ?? '', /checkpoint\.mjs/);
  assert.equal(await leadDecision(LEAD_HARD, 'Bash', command), null);
});

test('checkpoint.mjs commits the worktree changes with a Plan-checkpoint trailer', async () => {
  const { tree } = await linkedWorktree();
  await fs.writeFile(path.join(tree, 'a.txt'), 'two\n');
  const done = await run(CHECKPOINT, ['--plan', 'demo', '--task', '3'], { cwd: tree });
  assert.equal(done.code, 0, done.stderr);
  assert.match(git(tree, 'log', '-1', '--format=%B'), /^Plan-checkpoint: demo\/3$/m);
  assert.equal(git(tree, 'status', '--porcelain'), '');
});

test('checkpoint.mjs refuses the main checkout', async () => {
  const { main } = await linkedWorktree();
  await fs.writeFile(path.join(main, 'a.txt'), 'two\n');
  const refused = await run(CHECKPOINT, [], { cwd: main });
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /main checkout/);
});

test('land-task folds checkpoint commits into one task commit', async () => {
  const { root, planPath } = await landingCheckout();
  const base = git(root, 'rev-parse', 'HEAD');
  await editApp(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'checkpoint: one', '-m', 'Plan-checkpoint: fixture/1');
  await fs.appendFile(path.join(root, 'src/app.js'), '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'checkpoint: two', '-m', 'Plan-checkpoint: fixture/1');
  landTask({ planPath, planText: PLAN, number: 1, root });
  assert.equal(git(root, 'rev-list', '--count', `${base}..HEAD`), '1');
  const body = git(root, 'log', '-1', '--format=%B');
  assert.match(body, /^Plan-task: fixture\/1$/m);
  assert.doesNotMatch(body, /Plan-checkpoint/);
});

test('a stopped worker with a checkpoint commit and no report file is not refused', async () => {
  const { root, planPath } = await compactCheckout();
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'checkpoint: one', '-m', 'Plan-checkpoint: compact/1');
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
});

test('a stopped worker with a handoff and no report file is not refused', async () => {
  const { root, planPath } = await compactCheckout();
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/handoff-task-1.md'), 'done: greet\n');
  const landed = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(landed.code, 0, landed.stderr);
});

test('with no report, no handoff and no checkpoint the refusal names the compliant form', async () => {
  const { root, planPath } = await compactCheckout();
  const refused = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /no build report at/);
  assert.match(refused.stderr, /checkpoint\.mjs/);
  assert.match(refused.stderr, /Expected under Proof:/);
});
