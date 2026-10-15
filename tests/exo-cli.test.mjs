// exo-cli.mjs run against a temp repository: plan pick, branch setup, the
// dirty-tree refusal, and flags passed through to run-plan.mjs, which a stub
// claude (the run-plan STUB shape, reduced to a call record) stands behind.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { copyEnvFiles, envFileNames } from '../skills/build/scripts/exo-cli.mjs';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';

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

const keptReport = async (context) => {
  const kept = path.join(context.root, '.exo', 'kept');
  const [id] = await fs.readdir(kept);
  return fs.readFile(path.join(kept, id, 'report.md'), 'utf8');
};

const calls = async (context) => (await fs.readFile(context.record, 'utf8').catch(() => '')).split('\n').filter(Boolean);

test('no argument picks the newest plan, skips decisions files and creates a missing branch', async () => {
  const context = await setup();
  const result = await exo(context, ['run', '--dry-run', '--claude', context.stub]);
  assert.match(result.stdout, /^exo: plan .*new\.md$/m, result.stdout + result.stderr);
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/new');
});

test('an existing branch is switched to', async () => {
  const context = await setup();
  git(context.root, 'branch', 'feat/new');
  await exo(context, ['run', '--dry-run', '--claude', context.stub]);
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/new');
});

test('a dirty tree refuses with exit 2, names the files and spawns nothing', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  const result = await exo(context, ['run', '--claude', context.stub]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /^exo: refused: uncommitted edits in README\.md; commit them, or discard with git restore --staged --worktree -- README\.md$/m);
  assert.equal(git(context.root, 'branch', '--show-current'), 'main');
  assert.deepEqual(await calls(context), []);
  assert.match(await keptReport(context), /^Reason: refused: uncommitted edits in README\.md; /m);
});

test('exo wait prints the reason and the next step of a stopped run', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  await exo(context, ['run', '--claude', context.stub]);
  const [id] = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  const refused = await exo(context, ['wait', id]);
  assert.equal(refused.code, 1, refused.stdout + refused.stderr);
  assert.match(refused.stdout, /^Reason: refused: uncommitted edits in README\.md; /m);
  assert.match(refused.stdout, /^Next: fix the cause, then rerun node ".*exo-cli\.mjs" run ".*new\.md" --detach$/m);
  const statePath = path.join(context.root, '.exo', 'kept', id, 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  await fs.writeFile(statePath, JSON.stringify({ ...state, phase: 'stopped', reason: 'task 2 blocked' }));
  const stopped = await exo(context, ['wait', id]);
  assert.equal(stopped.code, 1, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout, /^Reason: task 2 blocked$/m);
  assert.match(stopped.stdout, new RegExp(`^Next: read .*report\\.md, repair, then node ".*exo-cli\\.mjs" run --resume ${id} --detach$`, 'm'));
});

test('exo wait points a parked run to approve, not to a refused resume', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  await exo(context, ['run', '--claude', context.stub]);
  const [id] = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  const statePath = path.join(context.root, '.exo', 'kept', id, 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  await fs.writeFile(statePath, JSON.stringify({ ...state, phase: 'parked', reason: 'needs approval' }));
  const parked = await exo(context, ['wait', id]);
  assert.match(parked.stdout, new RegExp(`^Next: .*approve ${id}$`, 'm'));
  assert.doesNotMatch(parked.stdout, /--resume/);
});

test('a run-plan refusal lands in report.md as Reason', async () => {
  const context = await setup();
  const result = await exo(context, ['run', 'docs/specs/old.md', '--session', 'bogus', '--claude', context.stub]);
  assert.equal(result.code, 2, result.stdout + result.stderr);
  const report = await keptReport(context);
  assert.match(report, /^Phase: refused$/m);
  assert.match(report, /^Reason: flag '--session' needs auto, task or plan$/m);
});

test('a run-plan preflight refusal on stdout lands in report.md as the bare Reason', async () => {
  const context = await setup();
  const plan = path.join(context.root, 'docs', 'specs', 'old.md');
  await fs.writeFile(plan, (await fs.readFile(plan, 'utf8')).replace('Branch: feat/old', 'Branch: main'));
  git(context.root, 'commit', '-q', '-am', 'docs: plan on the default branch');
  const result = await exo(context, ['run', 'docs/specs/old.md', '--claude', context.stub]);
  assert.equal(result.code, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /^run-plan: refused: Branch: main is the default branch$/m);
  const report = await keptReport(context);
  assert.match(report, /^Phase: refused$/m);
  assert.match(report, /^Reason: Branch: main is the default branch$/m);
});

test('no plan exits 2 with the hint', async () => {
  const context = await setup();
  await fs.rm(path.join(context.root, 'docs'), { recursive: true });
  git(context.root, 'add', '-A');
  git(context.root, 'commit', '-q', '-m', 'docs: drop plans');
  const result = await exo(context, ['run']);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /exo: no plan under docs\/specs\/ or docs\/plans\/; pass one: exo run <plan>/);
});

test('--dry-run passes through to run-plan and no session starts', async () => {
  const context = await setup();
  const result = await exo(context, ['run', 'docs/specs/old.md', '--dry-run', '--claude', context.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/old');
  assert.deepEqual(await calls(context), []);
});

const home = async () => {
  const dir = await fixture();
  return { dir, env: { HOME: dir, PATH: '/usr/bin:/bin' } };
};

test('setup writes the launcher, the config dir and prints the key lines and a PATH warning', async () => {
  const { dir, env } = await home();
  const result = await run(CLI, ['setup'], { env });
  assert.equal(result.code, 0, result.stderr);
  const target = path.join(dir, '.local', 'bin', 'exo');
  assert.equal((await fs.stat(target)).mode & 0o777, 0o755);
  assert.equal(
    await fs.readFile(target, 'utf8'),
    '#!/bin/sh\nroot=$(cat "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/exo/plugin-root") && exec node "$root/skills/build/scripts/exo-cli.mjs" "$@"\n'
  );
  assert.ok((await fs.stat(path.join(dir, '.config', 'exo'))).isDirectory());
  assert.match(result.stdout, /keys\.env/);
  assert.match(result.stdout, /^DEEPSEEK_API_KEY=$/m);
  assert.match(result.stdout, /^ZAI_API_KEY=$/m);
  assert.match(result.stdout, /not on PATH/);
  await assert.rejects(fs.stat(path.join(dir, '.config', 'exo', 'keys.env')));
});

test('setup refuses a different file at the target and reruns cleanly on its own launcher', async () => {
  const { dir, env } = await home();
  const target = path.join(dir, '.local', 'bin', 'exo');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'mine\n');
  const refused = await run(CLI, ['setup'], { env });
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /already exists/);
  assert.equal(await fs.readFile(target, 'utf8'), 'mine\n');
  await fs.rm(target);
  const onPath = { ...env, PATH: `${path.dirname(target)}:/usr/bin` };
  assert.equal((await run(CLI, ['setup'], { env: onPath })).code, 0);
  const again = await run(CLI, ['setup'], { env: onPath });
  assert.equal(again.code, 0);
  assert.doesNotMatch(again.stdout, /not on PATH/);
});

test('run config shows sources and key status without values, and writes one key', async () => {
  const { dir, env } = await home();
  await fs.mkdir(path.join(dir, '.config', 'exo'), { recursive: true });
  await fs.writeFile(path.join(dir, '.config', 'exo', 'keys.env'), 'DEEPSEEK_API_KEY=sekret123\n');
  const set = await run(CLI, ['run', 'config', 'defaults', '{"provider":"zai"}'], { env });
  assert.equal(set.code, 0, set.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, '.config', 'exo', 'run.json'), 'utf8')), { defaults: { provider: 'zai' } });
  const shown = await run(CLI, ['run', 'config'], { env });
  assert.match(shown.stdout, /^defaults\.provider = "zai" \(run\.json\)$/m);
  assert.match(shown.stdout, /^defaults\.effort = "medium" \(catalog\)$/m);
  assert.match(shown.stdout, /^key DEEPSEEK_API_KEY \(deepseek\): set$/m);
  assert.match(shown.stdout, /^key ZAI_API_KEY \(zai\): missing$/m);
  assert.doesNotMatch(shown.stdout + shown.stderr, /sekret123/);
  await run(CLI, ['run', 'config', 'note', 'plain text'], { env });
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, '.config', 'exo', 'run.json'), 'utf8')).note, 'plain text');
});

// A bare origin holding main, the fixture as its clone, and a second clone to push from.
async function withOrigin() {
  const context = await setup();
  const bare = path.join(await fixture(), 'origin.git');
  git(context.root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(context.root, 'remote', 'add', 'origin', bare);
  git(context.root, 'push', '-q', 'origin', 'main');
  git(context.root, 'remote', 'set-head', 'origin', 'main');
  git(context.root, 'fetch', '-q', 'origin');
  const other = path.join(await fixture(), 'other');
  git(await fixture(), 'clone', '-q', bare, other);
  const pushFrom = async (name) => {
    await fs.writeFile(path.join(other, name), `${name}\n`);
    git(other, 'add', '-A');
    git(other, 'commit', '-q', '-m', `feat: add ${name}`);
    git(other, 'push', '-q', 'origin', 'main');
  };
  return { ...context, bare, pushFrom };
}

test('the default branch is fetched and fast-forwarded before the plan branch is created from it', async () => {
  const context = await withOrigin();
  await context.pushFrom('upstream.txt');
  const result = await exo(context, ['run', '--claude', context.stub]);
  assert.match(result.stdout, /^exo: fast-forwarded main to origin\/main$/m);
  const upstream = git(context.bare, 'rev-parse', 'main');
  assert.equal(git(context.root, 'rev-parse', 'main'), upstream);
  assert.equal(git(context.root, 'rev-parse', 'feat/new'), upstream);
});

test('a diverged default branch refuses with one line and spawns nothing', async () => {
  const context = await withOrigin();
  await commitFiles(context.root, { 'local.txt': 'local\n' }, 'feat: local only');
  await context.pushFrom('upstream.txt');
  const result = await exo(context, ['run', '--claude', context.stub]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /^exo: refused: main and origin\/main have diverged; rebase or reset main onto origin\/main yourself, then rerun exo run$/m);
  assert.equal(git(context.root, 'branch', '--show-current'), 'main');
  assert.deepEqual(await calls(context), []);
});

test('a diverged default branch does not stop resuming a plan whose branch exists', async () => {
  const context = await withOrigin();
  git(context.root, 'branch', 'feat/new');
  await commitFiles(context.root, { 'local.txt': 'local\n' }, 'feat: local only');
  await context.pushFrom('upstream.txt');
  const result = await exo(context, ['run', '--claude', context.stub]);
  assert.notEqual(result.code, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /^exo: warning: main and origin\/main have diverged; going on with the existing plan branch$/m);
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/new');
});

test('--dry-run fetches, fast-forwards and deletes nothing', async () => {
  const context = await withOrigin();
  git(context.root, 'switch', '-q', '-c', 'feat/gone');
  git(context.root, 'switch', '-q', 'main');
  git(context.root, 'push', '-q', '-u', 'origin', 'feat/gone');
  git(context.bare, 'branch', '-D', 'feat/gone');
  await context.pushFrom('upstream.txt');
  const before = git(context.root, 'rev-parse', 'main');
  const result = await exo(context, ['run', '--dry-run', '--claude', context.stub]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(git(context.root, 'rev-parse', 'main'), before);
  assert.doesNotMatch(result.stdout, /fast-forwarded|removed branch/);
  assert.ok(git(context.root, 'branch', '--format=%(refname:short)').split('\n').includes('feat/gone'));
});

test('only merged branches whose upstream is gone are deleted; bookmarks, branches with a live upstream, unmerged and checked-out ones stay', async () => {
  const context = await withOrigin();
  const merged = async (name) => {
    git(context.root, 'switch', '-q', '-c', name);
    await commitFiles(context.root, { [`${name.replace('/', '-')}.txt`]: 'x\n' }, `feat: ${name}`);
    git(context.root, 'push', '-q', '-u', 'origin', name);
    git(context.root, 'switch', '-q', 'main');
    git(context.root, 'merge', '-q', '--no-ff', '-m', `merge ${name}`, name);
  };
  await merged('feat/done');
  await merged('feat/tree');
  await merged('feat/merged-pushed');
  git(context.root, 'switch', '-q', '-c', 'feat/wip');
  await commitFiles(context.root, { 'wip.txt': 'wip\n' }, 'feat: wip');
  git(context.root, 'push', '-q', '-u', 'origin', 'feat/wip');
  git(context.root, 'switch', '-q', 'main');
  git(context.root, 'branch', 'release-1.0');
  git(context.root, 'push', '-q', 'origin', 'main');
  for (const name of ['feat/done', 'feat/tree', 'feat/wip']) git(context.bare, 'branch', '-D', name);
  const trees = await fixture();
  git(context.root, 'worktree', 'add', '-q', path.join(trees, 'tree'), 'feat/tree');
  const result = await exo(context, ['run', '--claude', context.stub]);
  const branches = git(context.root, 'branch', '--format=%(refname:short)').split('\n');
  assert.ok(!branches.includes('feat/done'), branches.join());
  for (const name of ['feat/tree', 'feat/wip', 'release-1.0', 'feat/merged-pushed', 'feat/new']) assert.ok(branches.includes(name), `${name} in ${branches.join()}`);
  assert.ok((await fs.stat(path.join(trees, 'tree'))).isDirectory());
  assert.match(result.stdout, /^exo: removed branch feat\/done$/m);
});

test('with no argument a plan under docs/plans is found too', async () => {
  const context = await setup();
  const plans = path.join(context.root, 'docs', 'plans');
  await fs.mkdir(plans, { recursive: true });
  await fs.writeFile(path.join(plans, 'fresh.md'), planText(context.root, 'feat/fresh'));
  git(context.root, 'add', '-A');
  git(context.root, 'commit', '-q', '-m', 'docs: add a plan');
  const result = await exo(context, ['run', '--dry-run', '--claude', context.stub]);
  assert.match(result.stdout, /^exo: plan .*docs\/plans\/fresh\.md$/m, result.stdout + result.stderr);
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/fresh');
});

async function pointed(context) {
  const config = await fixture();
  await fs.mkdir(path.join(config, 'exo'), { recursive: true });
  await fs.writeFile(path.join(config, 'exo', 'plugin-root'), `${context.root}\n`);
  return config;
}

const runPointed = (context, config) => run(CLI, ['run', 'docs/specs/new.md', '--claude', context.stub], {
  cwd: context.root,
  env: { STUB_RECORD: context.record, HOME: context.home, CLAUDE_CONFIG_DIR: config }
});

test('worktree: the checkout the plugin-root pointer names stays on main and the branch is built in a worktree, reused by a second run', async () => {
  const context = await setup();
  const config = await pointed(context);
  const result = await runPointed(context, config);
  assert.equal(git(context.root, 'branch', '--show-current'), 'main', result.stdout + result.stderr);
  const tree = await fs.realpath(path.join(context.root, '.worktrees', 'feat-new'));
  assert.equal(git(tree, 'branch', '--show-current'), 'feat/new');
  const first = await calls(context);
  assert.ok(first.length > 0, result.stdout + result.stderr);
  for (const line of first) assert.equal(await fs.realpath(JSON.parse(line)[0]), tree);
  const again = await runPointed(context, config);
  assert.equal(again.code, result.code, again.stdout + again.stderr);
  assert.doesNotMatch(again.stderr, /worktree add/);
  assert.equal(git(context.root, 'branch', '--show-current'), 'main');
  const second = (await calls(context)).slice(first.length);
  assert.ok(second.length > 0, again.stdout + again.stderr);
  for (const line of second) assert.equal(await fs.realpath(JSON.parse(line)[0]), tree);
});

test('worktree: the main checkout already on the plan branch refuses with exit 2 and the git switch hint', async () => {
  const context = await setup();
  const config = await pointed(context);
  git(context.root, 'switch', '-q', '-c', 'feat/new');
  const result = await runPointed(context, config);
  assert.equal(result.code, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /^exo: branch feat\/new is checked out in the main checkout .*git switch main/m);
  assert.deepEqual(await calls(context), []);
});

test('worktree: a checkout the pointer does not name is switched in place', async () => {
  const context = await setup();
  const config = await fixture();
  await fs.mkdir(path.join(config, 'exo'), { recursive: true });
  await fs.writeFile(path.join(config, 'exo', 'plugin-root'), `${config}\n`);
  await run(CLI, ['run', '--dry-run', '--claude', context.stub], {
    cwd: context.root,
    env: { STUB_RECORD: context.record, HOME: context.home, CLAUDE_CONFIG_DIR: config }
  });
  assert.equal(git(context.root, 'branch', '--show-current'), 'feat/new');
});

test('env names: only names starting with .env match', () => {
  const names = ['.env', '.env.local', '.envrc', 'env.txt', 'a.env', '.gitignore'];
  assert.deepEqual(envFileNames(names), ['.env', '.env.local', '.envrc']);
});

test('env copy: only gitignored files matching the pattern are copied, none staged', async () => {
  const root = await gitRepository({ 'README.md': 'fixture\n', '.gitignore': 'local.cfg\nother.cfg\n', 'tracked.cfg': 'kept\n' });
  await fs.writeFile(path.join(root, 'local.cfg'), 'secret\n');
  await fs.writeFile(path.join(root, 'other.txt'), 'plain\n');
  const where = await fixture();
  const copied = copyEnvFiles(root, where, /\.cfg$/);
  assert.deepEqual(copied, ['local.cfg']);
  assert.equal(await fs.readFile(path.join(where, 'local.cfg'), 'utf8'), 'secret\n');
  assert.deepEqual(await fs.readdir(where), ['local.cfg']);
  assert.equal(git(root, 'status', '--porcelain'), '?? other.txt');
});

test('SIGTERM to exo-cli alone leaves no live claude process', async () => {
  const context = await setup();
  const pidFile = path.join(context.home, 'stub.pid');
  const hang = path.join(context.home, 'hang.mjs');
  await fs.writeFile(hang, `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);
  const cli = spawn(process.execPath, [CLI, 'run', 'docs/specs/old.md', '--claude', hang], { cwd: context.root, env: { ...process.env, STUB_RECORD: context.record, HOME: context.home }, stdio: 'ignore' });
  const exited = new Promise((resolve) => cli.on('close', (code) => resolve(code)));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const until = async (done) => { for (let round = 0; round < 100 && !(await done()); round += 1) await new Promise((r) => setTimeout(r, 100)); };
  await until(() => fs.access(pidFile).then(() => true, () => false));
  const stub = Number(await fs.readFile(pidFile, 'utf8'));
  assert.ok(alive(stub), 'the stub claude runs');
  cli.kill('SIGTERM');
  const code = await exited;
  await until(() => !alive(stub));
  assert.ok(!alive(stub), 'the stub claude is gone');
  assert.notEqual(code, 0);
});

test('exo wait quotes a plan path with a space in the refused Next line', async () => {
  const context = await setup();
  await fs.writeFile(path.join(context.root, 'README.md'), 'edited\n');
  await exo(context, ['run', '--claude', context.stub]);
  const [id] = await fs.readdir(path.join(context.root, '.exo', 'kept'));
  const statePath = path.join(context.root, '.exo', 'kept', id, 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  await fs.writeFile(statePath, JSON.stringify({ ...state, plan: '/tmp/a plan/new.md' }));
  const refused = await exo(context, ['wait', id]);
  assert.match(refused.stdout, /^Next: .* run "\/tmp\/a plan\/new\.md" --detach$/m);
});
