import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_IDENTITY, git, tempDir } from './harness.mjs';

export const START_RUN = fileURLToPath(new URL('../skills/build/scripts/start-run.mjs', import.meta.url));

function planText(repo, proofs, app) {
  const tasks = proofs.flatMap((proof, index) => [
    `### Task ${index + 1}: feat(x): task ${index + 1}`,
    `Depends on: none | Files: \`f${index + 1}.txt\` | Data: d | Proof: ${proof}`,
    '',
  ]);
  return [
    '# Demo', '', '## Goal', 'g', '', '## Plan basis', `Repository: ${repo}`, 'Branch: work', 'Worktree setup: none',
    'Land gate: node --version', 'Land: local', 'Commit: feat(x): y', 'Lint: none', 'Allow: none', `App: ${app}`, '',
    '## Success criterion', '`true`', 'Red: none (demo plan)', 'Product run: none', '',
    '## Checkpoint', '- Blocks first: none.', '- Parallel: none.', '- Shared state: none', '- Smallest safe split: one each', '',
    '## Tasks', ...tasks,
  ].join('\n');
}

export function runPlanText(root, { title, branch = 'feat/fixture', basis = [], criterion = [], sections = [], tasks = ['### Task 1: feat(a): add a', 'Depends on: none | Files: `src/app.js` | Data: a line | Proof: node --version', ''] }) {
  return [
    `# Plan: ${title}`, '', '## Goal', 'One file.', '',
    '## Plan basis', `Repository: ${root}`, `Branch: ${branch}`, 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', ...basis, '',
    '## Success criterion', '`node --version`', ...criterion, '',
    '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
    '## Manual checks', '- Open the file.', '',
    ...sections,
    '## Tasks', ...tasks
  ].join('\n');
}

export function startRunWithNpx({ proofs, app = 'none', npxBody = '', env = {} }) {
  const repo = fs.realpathSync(tempDir('setup-run-'));
  git(repo, 'init', '-q', '-b', 'work');
  const plan = path.join(repo, 'docs', 'plans', 'demo.md');
  fs.mkdirSync(path.dirname(plan), { recursive: true });
  fs.writeFileSync(plan, planText(repo, proofs, app));
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'feat(x): one', '-m', 'Plan-task: demo/1');
  const fakes = tempDir('setup-bin-');
  const calls = path.join(fakes, 'calls.txt');
  fs.writeFileSync(path.join(fakes, 'npx'), `#!/bin/sh\necho "$@" >> '${calls}'\n${npxBody}\n`, { mode: 0o755 });
  const childEnv = { ...process.env, ...GIT_IDENTITY, XDG_CACHE_HOME: path.join(fakes, 'cache'), PATH: `${fakes}${path.delimiter}${process.env.PATH}`, ...env };
  delete childEnv.CLAUDE_CODE_SESSION_ID;
  delete childEnv.EXO_RUN_TASK;
  const result = spawnSync(process.execPath, [START_RUN, '--plan', plan, '--root', repo, '--checkout', repo], { encoding: 'utf8', env: childEnv });
  const called = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean) : [];
  return { result, repo, called, fakes };
}
