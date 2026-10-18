import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parsePlan } from '#plan-tasks';
import { planPrompt } from '../skills/build/scripts/run-prompts.mjs';
import { childEnv, PLUGIN_ROOT } from '../skills/build/scripts/run-session.mjs';

const PROVIDER = { name: 'claude', env: {}, effort: null, promptCacheTtl: null };
const GUARD = path.join(PLUGIN_ROOT, 'lib', 'stall-guard.mjs');
const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

function seedRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-no-commit-'));
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'run@example.com');
  git('config', 'user.name', 'run');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'seed');
  fs.writeFileSync(path.join(root, 'b.txt'), 'b\n');
  git('add', 'b.txt');
  return { root, head: () => git('rev-parse', 'HEAD').stdout.trim() };
}

const sessionCommits = [
  'git commit -q -m "feat(text): add b" -m "Plan-task: 1"',
  'git commit --no-verify -q -m "feat(text): add b"'
];

// why: a plan session committed its tasks while the stall guard wrapped the command, so no `Bash(git commit *)` deny rule matched.
test('a build session cannot commit on the run tree, bare or wrapped by the stall guard', () => {
  for (const command of sessionCommits) {
    for (const wrapped of [command, `node "${GUARD}" -- ${shellQuote(command)}`]) {
      const { root, head } = seedRepo();
      const env = childEnv('plan/1', PROVIDER, { refuseCommits: root });
      const before = head();
      const run = spawnSync('bash', ['-c', wrapped], { cwd: root, env, encoding: 'utf8' });
      assert.notEqual(run.status, 0, wrapped);
      assert.match(run.stderr, /the run script commits and lands each task after this session ends/, wrapped);
      assert.equal(head(), before, wrapped);
    }
  }
});

// why: a session's Land gate runs test suites that commit in temp fixture repos.
test('a build session still commits in a repo other than the run root', () => {
  const run = seedRepo();
  const fixture = seedRepo();
  const before = fixture.head();
  const env = childEnv('plan/1', PROVIDER, { refuseCommits: run.root });
  const result = spawnSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: fixture.root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(fixture.head(), before);
});

// why: a session runs its tasks' Proof, and those tests init repos, commit and add worktrees in temp fixture repos; a restriction in the session env reaches each of them.
test('this repo\'s fixture-repo tests pass unchanged under a session env rooted at this repo', () => {
  const root = spawnSync('git', ['-C', PLUGIN_ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const env = childEnv('plan/1', PROVIDER, { refuseCommits: root });
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', 'tests/pressure-run-folder.test.mjs'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout.split('\n').filter((line) => /not ok|✖|Error/.test(line)).join('\n'));
});

test('the script still commits outside the session env', () => {
  const { root, head } = seedRepo();
  const before = head();
  const run = spawnSync('git', ['-C', root, 'commit', '-q', '-m', 'feat(text): add b'], { env: childEnv('plan/1', PROVIDER), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.notEqual(head(), before);
});

const PLAN = `# Fixture

## Goal

The library exports \`capitalize\`.

## Plan basis

Land gate: none
Lint: none

## Success criterion

\`node --test\` passes.

## Tasks

### Task 1: Add capitalize

Files:
- Create: \`src/capitalize.js\`

Step 1: Write the module
Run: \`node --test src/capitalize.test.js\`
Expected: \`pass 1\`

Commit:
\`\`\`bash
git add src/capitalize.js
git commit -m "feat(text): add capitalize" -m "Plan-task: 1"
\`\`\`
`;

test('a plan session brief keeps the task but not its Commit: block', () => {
  const { root } = seedRepo();
  const planPath = path.join(root, 'plan.md');
  const plan = parsePlan(PLAN);
  const text = planPrompt({ plan, planPath, numbers: [1], root, sandbox: false });
  assert.match(text, /Step 1: Write the module/);
  assert.doesNotMatch(text, /git commit/);
});
