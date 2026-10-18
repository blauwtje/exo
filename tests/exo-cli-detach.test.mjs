import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  '## Plan basis', `Repository: ${root}`, `Branch: ${branch}`, 'Land: local', 'Commit: feat(fixture): add the fixture', 'Worktree setup: none', 'Land gate: none', 'Lint: none', 'Allow: none', '',
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

const GIT_SHIM = (log, realPath) => `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('status') && args.includes('--porcelain') && args.includes('--untracked-files=no')) fs.appendFileSync(${JSON.stringify(log)}, 'status\\n');
const answer = spawnSync('git', args, { stdio: 'inherit', env: { ...process.env, PATH: ${JSON.stringify(realPath)} } });
process.exit(answer.status ?? 1);
`;

async function finished(root) {
  const kept = path.join(root, '.exo', 'kept');
  for (let round = 0; round < 100; round += 1) {
    const ids = await fs.readdir(kept).catch(() => []);
    if (ids.length > 0) return ids[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

test('a detached dry run checks the tracked tree twice, not three times', async () => {
  const context = await setup();
  const shims = await fixture();
  const log = path.join(shims, 'status.log');
  await fs.writeFile(path.join(shims, 'git'), GIT_SHIM(log, process.env.PATH), { mode: 0o755 });
  const result = await run(CLI, ['run', path.join(context.root, 'docs', 'specs', 'new.md'), '--detach', '--dry-run', '--claude', context.stub], {
    cwd: context.root,
    env: { STUB_RECORD: context.record, HOME: context.home, PATH: `${shims}${path.delimiter}${process.env.PATH}` }
  });
  assert.equal(result.code, 0);
  assert.notEqual(await finished(context.root), null);
  const statuses = (await fs.readFile(log, 'utf8')).split('\n').filter(Boolean);
  assert.equal(statuses.length, 2);
});

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

test('wait on a stopped run points its Next line at the watching reference, and the file exists', async () => {
  const context = await setup();
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  const dir = path.join(context.root, '.exo', 'run', 'stopped-run');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ phase: 'stopped', pid: dead, plan: 'plan.md' }));
  const result = await exo(context, ['wait', 'stopped-run']);
  const next = result.stdout.split('\n').find((line) => line.startsWith('Next:')) ?? '';
  const pointer = next.match(/repair per (\S+watching\.md)/)?.[1];
  assert.ok(pointer, `${result.stdout}${result.stderr}`);
  assert.ok(pointer.endsWith(path.join('skills', 'spec', 'references', 'watching.md')), pointer);
  assert.ok((await fs.stat(pointer)).isFile());
});
