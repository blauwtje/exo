import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));

const STUB = `
import fs from 'node:fs';
fs.appendFileSync(process.env.STUB_RECORD, JSON.stringify([process.cwd(), ...process.argv.slice(2)]) + '\\n');
`;

const planText = (root, branch) => [
  '# Plan: cli fixture', '', '## Goal', 'One file.', '',
  '## Plan basis', `Repository: ${root}`, `Branch: ${branch}`, 'Land: local', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
  '## Success criterion', '`node --version`', '',
  '## Checkpoint', '- Blocks first: Task 1.', '- Parallel: none.', '- Shared state: none.', '- Smallest safe split: one file per task.', '',
  '## Manual checks', '- Open the file.', '',
  '## Tasks', '### Task 1: feat(a): add a',
  'Depends on: none | Files: `a.txt` | Data: a line | Proof: node --version', ''
].join('\n');

async function setup() {
  const root = await gitRepository({ 'README.md': 'fixture\n' });
  const specs = path.join(root, 'docs', 'specs');
  await fs.mkdir(specs, { recursive: true });
  await fs.writeFile(path.join(specs, 'old.md'), planText(root, 'feat/old'));
  await fs.writeFile(path.join(specs, 'new.md'), planText(root, 'feat/new'));
  await fs.writeFile(path.join(specs, 'new-decisions.md'), 'decisions\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'docs: add plans');
  const past = new Date(Date.now() - 60_000);
  await fs.utimes(path.join(specs, 'old.md'), past, past);
  const now = new Date(Date.now() - 30_000);
  await fs.utimes(path.join(specs, 'new.md'), now, now);
  await fs.utimes(path.join(specs, 'new-decisions.md'), new Date(), new Date());
  const tools = await fixture();
  const stub = path.join(tools, 'claude.mjs');
  await fs.writeFile(stub, STUB);
  return { root, stub, record: path.join(tools, 'calls.jsonl'), home: await fixture() };
}

const exo = (context, args) => run(CLI, args, {
  cwd: context.root,
  env: { STUB_RECORD: context.record, HOME: context.home }
});

const calls = async (context) => (await fs.readFile(context.record, 'utf8').catch(() => '')).split('\n').filter(Boolean);

test('a dirty tree refuses a detached run before it detaches', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  const result = await exo(context, ['run', '--detach', '--claude', context.stub]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /^exo: refused: uncommitted edits in README\.md; commit them, or discard with git restore --staged --worktree -- README\.md$/m);
  assert.doesNotMatch(result.stdout, /started in the background/);
  assert.deepEqual(await fs.readdir(path.join(context.root, '.exo', 'run')).catch(() => []), []);
  assert.deepEqual(await calls(context), []);
});
