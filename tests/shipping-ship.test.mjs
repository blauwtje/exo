// The shipping route as one script: push, open a pull request, merge one, or
// merge a list of pull requests in their stacking order, run from a single
// command instead of separate model calls. Push is exercised against a real
// bare origin; gh is a stand-in that logs its argv and answers from a
// scenario.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';

const SHIP = fileURLToPath(new URL('../skills/shipping/scripts/ship.mjs', import.meta.url));

// A repository on `main`, cloned from a bare `origin` the way a real checkout
// would be, so `refs/remotes/origin/HEAD` and upstream tracking are real.
async function shipRepository() {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const bareRoot = await fixture();
  const origin = path.join(bareRoot, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const cloneRoot = await fs.realpath(await fixture());
  const workDir = path.join(cloneRoot, 'work');
  execFileSync('git', ['clone', '-q', origin, workDir]);
  return { workDir, origin };
}

// Stands in for gh: logs its arguments, then answers with the reply a test's
// scenario names for that exact command, a queue for one logged twice.
const GH_STAND_IN = [
  '#!/usr/bin/env node',
  "const fs = require('node:fs');",
  "const argv = process.argv.slice(2).join(' ');",
  "fs.appendFileSync(process.env.STAND_IN_LOG, argv + '\\n');",
  "const scenario = JSON.parse(fs.readFileSync(process.env.STAND_IN_SCENARIO, 'utf8'));",
  'let state = {};',
  "try { state = JSON.parse(fs.readFileSync(process.env.STAND_IN_STATE, 'utf8')); } catch {}",
  'let reply = scenario[argv];',
  'if (Array.isArray(reply)) {',
  '  const index = state[argv] || 0;',
  '  reply = reply[Math.min(index, reply.length - 1)];',
  '  state[argv] = index + 1;',
  "  fs.writeFileSync(process.env.STAND_IN_STATE, JSON.stringify(state));",
  '}',
  "if (!reply) { console.error(`stand-in gh: no reply for '${argv}'`); process.exit(1); }",
  'if (reply.stdout) process.stdout.write(reply.stdout);',
  'if (reply.stderr) process.stderr.write(reply.stderr);',
  'process.exit(reply.exit || 0);',
  ''
].join('\n');

async function ghBin(scenario) {
  const directory = await fixture();
  const bin = path.join(directory, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(path.join(bin, 'gh'), GH_STAND_IN, { mode: 0o755 });
  await fs.writeFile(path.join(directory, 'scenario.json'), JSON.stringify(scenario));
  return { bin, scenarioFile: path.join(directory, 'scenario.json'), stateFile: path.join(directory, 'state.json'), log: path.join(directory, 'calls.log') };
}

async function shipRun(workDir, args, scenario = {}) {
  const gh = await ghBin(scenario);
  const outcome = await run(SHIP, args, {
    cwd: workDir,
    env: { PATH: `${gh.bin}${path.delimiter}${process.env.PATH}`, STAND_IN_LOG: gh.log, STAND_IN_SCENARIO: gh.scenarioFile, STAND_IN_STATE: gh.stateFile }
  });
  const logged = await fs.readFile(gh.log, 'utf8').catch(() => '');
  const calls = logged.split('\n').filter((line) => line !== '');
  for (const call of calls) assert.doesNotMatch(call, /--delete-branch|--admin|--auto\b/, call);
  return { ...outcome, calls };
}

test('open-pr checks the body, pushes, reads the issue and creates the pull request', async () => {
  const { workDir, origin } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await fs.writeFile(path.join(workDir, 'body.md'), 'Adds the feature.\n\nCloses #7\n');
  const scenario = {
    'pr view feat/x --json number,url,state': { exit: 1, stderr: 'no pull requests found for branch "feat/x"\n' },
    'issue view 7 --json labels,milestone,projectItems': { stdout: `${JSON.stringify({ labels: [{ name: 'bug' }], milestone: { title: 'v1' }, projectItems: [] })}\n` },
    'pr create --base main --head feat/x --title feat: x --body-file body.md --label bug --milestone v1': { stdout: 'https://github.com/acme/widgets/pull/42\n' }
  };
  const outcome = await shipRun(workDir, ['--route', 'open-pr', '--title', 'feat: x', '--body', 'body.md', '--issue', '7'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'https://github.com/acme/widgets/pull/42 open\n');
  assert.deepEqual(outcome.calls, [
    'pr view feat/x --json number,url,state',
    'issue view 7 --json labels,milestone,projectItems',
    'pr create --base main --head feat/x --title feat: x --body-file body.md --label bug --milestone v1'
  ]);
  const remoteBranches = execFileSync('git', ['ls-remote', '--heads', origin], { encoding: 'utf8' });
  assert.match(remoteBranches, /refs\/heads\/feat\/x/);
});

test('push on a branch prints "<branch> pushed" and pushes for real', async () => {
  const { workDir, origin } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  const outcome = await shipRun(workDir, ['--route', 'push']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'feat/x pushed\n');
  assert.deepEqual(outcome.calls, []);
  const remoteBranches = execFileSync('git', ['ls-remote', '--heads', origin], { encoding: 'utf8' });
  assert.match(remoteBranches, /refs\/heads\/feat\/x/);
});

test('push on the default branch runs --follow-tags and carries an unpushed tag along', async () => {
  const { workDir, origin } = await shipRepository();
  await commitFiles(workDir, { 'CHANGES.md': 'v1\n' }, 'chore: note v1');
  git(workDir, 'tag', '-a', 'v0.0.1', '-m', 'v0.0.1');
  const outcome = await shipRun(workDir, ['--route', 'push']);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'main pushed\n');
  const remoteTags = execFileSync('git', ['ls-remote', '--tags', origin], { encoding: 'utf8' });
  assert.match(remoteTags, /refs\/tags\/v0\.0\.1/);
});

test('push stops when the default branch cannot be read, and never pushes', async () => {
  const { workDir, origin } = await shipRepository();
  git(workDir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
  const before = execFileSync('git', ['rev-parse', 'main'], { cwd: origin, encoding: 'utf8' }).trim();
  await commitFiles(workDir, { 'x.txt': 'x\n' }, 'chore: change');
  const outcome = await shipRun(workDir, ['--route', 'push']);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'main stopped push default-branch=unknown\n');
  const after = execFileSync('git', ['rev-parse', 'main'], { cwd: origin, encoding: 'utf8' }).trim();
  assert.equal(after, before);
});

test('a body missing "Closes #<n>" stops before any push', async () => {
  const { workDir, origin } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await fs.writeFile(path.join(workDir, 'body.md'), 'Adds the feature, no issue reference.\n');
  const outcome = await shipRun(workDir, ['--route', 'open-pr', '--title', 'feat: x', '--body', 'body.md', '--issue', '7']);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'feat/x stopped create body-missing-closes-7\n');
  assert.deepEqual(outcome.calls, []);
  const remoteBranches = execFileSync('git', ['ls-remote', '--heads', origin], { encoding: 'utf8' });
  assert.doesNotMatch(remoteBranches, /refs\/heads\/feat\/x/);
});

test('an existing open pull request is reused with no pr create', async () => {
  const { workDir } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await fs.writeFile(path.join(workDir, 'body.md'), 'Adds the feature.\n');
  const scenario = { 'pr view feat/x --json number,url,state': { stdout: `${JSON.stringify({ number: 42, url: 'https://github.com/acme/widgets/pull/42', state: 'OPEN' })}\n` } };
  const outcome = await shipRun(workDir, ['--route', 'open-pr', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, 'https://github.com/acme/widgets/pull/42 open\n');
  assert.deepEqual(outcome.calls, ['pr view feat/x --json number,url,state']);
});

// The pull request read by "create" and reused through wait, gate, merge and
// confirm, so a pr-merge test never needs to name a number by hand.
const OPEN_PR = { number: 42, url: 'https://github.com/acme/widgets/pull/42', state: 'OPEN' };
const REUSE = { 'pr view feat/x --json number,url,state': { stdout: `${JSON.stringify(OPEN_PR)}\n` } };
const GATE_FIELDS = 'number,state,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup';
const CLEAN_GATE = { stdout: `${JSON.stringify({ number: 42, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: null, statusCheckRollup: [] })}\n` };
const CHECKS_PASS = { stdout: 'All checks were successful\n' };

async function prMergeRepository() {
  const { workDir, origin } = await shipRepository();
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  await fs.writeFile(path.join(workDir, 'body.md'), 'Adds the feature.\n');
  return { workDir, origin };
}

test('pr-merge waits, gates, merges and confirms in order', async () => {
  const { workDir } = await prMergeRepository();
  const scenario = {
    ...REUSE,
    'pr checks 42 --watch --fail-fast': CHECKS_PASS,
    [`pr view 42 --json ${GATE_FIELDS}`]: CLEAN_GATE,
    'pr merge 42 --squash': { stdout: '' },
    'pr view 42 --json state,mergedAt,url': { stdout: `${JSON.stringify({ state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', url: OPEN_PR.url })}\n` }
  };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} merged\n`);
  assert.deepEqual(outcome.calls, [
    'pr view feat/x --json number,url,state',
    'pr checks 42 --watch --fail-fast',
    `pr view 42 --json ${GATE_FIELDS}`,
    'pr merge 42 --squash',
    'pr view 42 --json state,mergedAt,url'
  ]);
});

test('a red check stops wait and never merges', async () => {
  const { workDir } = await prMergeRepository();
  const scenario = { ...REUSE, 'pr checks 42 --watch --fail-fast': { stdout: 'test (ubuntu-latest)  fail\n', exit: 1 } };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} stopped wait fail test (ubuntu-latest)\n`);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('a failing check on the gate stops before any merge', async () => {
  const { workDir } = await prMergeRepository();
  const failingGate = { stdout: `${JSON.stringify({ number: 42, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: null, statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: 'FAILURE' }] })}\n` };
  const scenario = { ...REUSE, 'pr checks 42 --watch --fail-fast': CHECKS_PASS, [`pr view 42 --json ${GATE_FIELDS}`]: failingGate };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} stopped gate conclusion=FAILURE build\n`);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('BEHIND updates the branch and gates again before merging', async () => {
  const { workDir } = await prMergeRepository();
  const behindGate = { stdout: `${JSON.stringify({ number: 42, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', reviewDecision: null, statusCheckRollup: [] })}\n` };
  const scenario = {
    ...REUSE,
    'pr checks 42 --watch --fail-fast': CHECKS_PASS,
    [`pr view 42 --json ${GATE_FIELDS}`]: [behindGate, CLEAN_GATE],
    'pr update-branch 42': { stdout: '' },
    'pr merge 42 --squash': { stdout: '' },
    'pr view 42 --json state,mergedAt,url': { stdout: `${JSON.stringify({ state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', url: OPEN_PR.url })}\n` }
  };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} merged\n`);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr update-branch')), ['pr update-branch 42']);
});

test('BEHIND three times stops after two updates, and never merges', async () => {
  const { workDir } = await prMergeRepository();
  const behindGate = { stdout: `${JSON.stringify({ number: 42, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'BEHIND', reviewDecision: null, statusCheckRollup: [] })}\n` };
  const scenario = {
    ...REUSE,
    'pr checks 42 --watch --fail-fast': CHECKS_PASS,
    [`pr view 42 --json ${GATE_FIELDS}`]: [behindGate, behindGate, behindGate],
    'pr update-branch 42': { stdout: '' }
  };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} stopped gate BEHIND\n`);
  assert.deepEqual(outcome.calls.filter((call) => call === 'pr update-branch 42').length, 2);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('DIRTY exits 4 and never merges', async () => {
  const { workDir } = await prMergeRepository();
  const dirtyGate = { stdout: `${JSON.stringify({ number: 42, state: 'OPEN', mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', reviewDecision: null, statusCheckRollup: [] })}\n` };
  const scenario = { ...REUSE, 'pr checks 42 --watch --fail-fast': CHECKS_PASS, [`pr view 42 --json ${GATE_FIELDS}`]: dirtyGate };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 4, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} stopped gate DIRTY\n`);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('a merged-but-not-confirmed pull request stops confirm', async () => {
  const { workDir } = await prMergeRepository();
  const scenario = {
    ...REUSE,
    'pr checks 42 --watch --fail-fast': CHECKS_PASS,
    [`pr view 42 --json ${GATE_FIELDS}`]: CLEAN_GATE,
    'pr merge 42 --squash': { stdout: '' },
    'pr view 42 --json state,mergedAt,url': { stdout: `${JSON.stringify({ state: 'OPEN', mergedAt: null, url: OPEN_PR.url })}\n` }
  };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, `${OPEN_PR.url} stopped confirm state=OPEN\n`);
});

test('--method rebase merges with --rebase', async () => {
  const { workDir } = await prMergeRepository();
  const scenario = {
    ...REUSE,
    'pr checks 42 --watch --fail-fast': CHECKS_PASS,
    [`pr view 42 --json ${GATE_FIELDS}`]: CLEAN_GATE,
    'pr merge 42 --rebase': { stdout: '' },
    'pr view 42 --json state,mergedAt,url': { stdout: `${JSON.stringify({ state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', url: OPEN_PR.url })}\n` }
  };
  const outcome = await shipRun(workDir, ['--route', 'pr-merge', '--title', 'feat: x', '--body', 'body.md', '--method', 'rebase'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), ['pr merge 42 --rebase']);
});

test('a bad route, mode or missing flag is a usage error that runs no gh', async () => {
  const { workDir } = await shipRepository();
  const cases = [
    [],
    ['--route', 'rebase'],
    ['--route', 'open-pr', '--body', 'body.md'],
    ['--route', 'open-pr', '--title', 'feat: x'],
    ['--route', 'pr-merge', '--title', 'feat: x'],
    ['--route', 'push', '--merge', '12'],
    ['--merge', '12', '--route', 'push']
  ];
  for (const args of cases) {
    const outcome = await shipRun(workDir, args);
    assert.equal(outcome.code, 2, args.join(' '));
    assert.equal(outcome.stdout, '', args.join(' '));
    assert.deepEqual(outcome.calls, [], args.join(' '));
  }
});

// --merge orders pull requests by ship-gate.mjs --order before gating them,
// so a scenario answers the order lookup (baseRefName/headRefName) as well
// as the per-number view, gate, merge and confirm calls.
const ORDER_FIELDS = 'number,baseRefName,headRefName';
function stacked(number, base, head) {
  return { stdout: `${JSON.stringify({ number, baseRefName: base, headRefName: head })}\n` };
}
function mergeScenario(number, url) {
  return {
    [`pr view ${number} --json number,url,state`]: { stdout: `${JSON.stringify({ number, url, state: 'OPEN' })}\n` },
    [`pr view ${number} --json ${GATE_FIELDS}`]: { stdout: `${JSON.stringify({ number, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', reviewDecision: null, statusCheckRollup: [] })}\n` },
    [`pr merge ${number} --squash`]: { stdout: '' },
    [`pr view ${number} --json state,mergedAt,url`]: { stdout: `${JSON.stringify({ state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', url })}\n` }
  };
}

test('--merge orders stacked pull requests and merges the base before the head', async () => {
  const { workDir } = await shipRepository();
  const url12 = 'https://github.com/acme/widgets/pull/12';
  const url13 = 'https://github.com/acme/widgets/pull/13';
  const scenario = {
    [`pr view 13 --json ${ORDER_FIELDS}`]: stacked(13, 'main-12', 'feat/13'),
    [`pr view 12 --json ${ORDER_FIELDS}`]: stacked(12, 'main', 'main-12'),
    ...mergeScenario(12, url12),
    ...mergeScenario(13, url13)
  };
  const outcome = await shipRun(workDir, ['--merge', '13', '12'], scenario);
  assert.equal(outcome.code, 0, outcome.stderr);
  assert.equal(outcome.stdout, `${url12} merged\n${url13} merged\n`);
});

test('--merge stops the whole run on CYCLE and merges nothing', async () => {
  const { workDir } = await shipRepository();
  const scenario = {
    [`pr view 12 --json ${ORDER_FIELDS}`]: stacked(12, 'feat/13', 'feat/12'),
    [`pr view 13 --json ${ORDER_FIELDS}`]: stacked(13, 'feat/12', 'feat/13')
  };
  const outcome = await shipRun(workDir, ['--merge', '12', '13'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'stopped order CYCLE 12 13\n');
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('--merge prints a stop for one pull request and still merges the next', async () => {
  const { workDir } = await shipRepository();
  const url13 = 'https://github.com/acme/widgets/pull/13';
  const failingGate = { stdout: `${JSON.stringify({ number: 12, state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', reviewDecision: null, statusCheckRollup: [{ name: 'build', status: 'COMPLETED', conclusion: 'FAILURE' }] })}\n` };
  const scenario = {
    [`pr view 12 --json ${ORDER_FIELDS}`]: stacked(12, 'main', 'feat/12'),
    [`pr view 13 --json ${ORDER_FIELDS}`]: stacked(13, 'feat/12', 'feat/13'),
    [`pr view 12 --json number,url,state`]: { stdout: `${JSON.stringify({ number: 12, url: 'https://github.com/acme/widgets/pull/12', state: 'OPEN' })}\n` },
    [`pr view 12 --json ${GATE_FIELDS}`]: failingGate,
    ...mergeScenario(13, url13)
  };
  const outcome = await shipRun(workDir, ['--merge', '12', '13'], scenario);
  assert.equal(outcome.code, 1, outcome.stderr);
  assert.equal(outcome.stdout, 'https://github.com/acme/widgets/pull/12 stopped gate conclusion=FAILURE build\n' + `${url13} merged\n`);
});

test('--merge exits 4 when one pull request gates DIRTY', async () => {
  const { workDir } = await shipRepository();
  const dirtyGate = { stdout: `${JSON.stringify({ number: 12, state: 'OPEN', mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', reviewDecision: null, statusCheckRollup: [] })}\n` };
  const scenario = {
    [`pr view 12 --json ${ORDER_FIELDS}`]: stacked(12, 'main', 'feat/12'),
    [`pr view 12 --json number,url,state`]: { stdout: `${JSON.stringify({ number: 12, url: 'https://github.com/acme/widgets/pull/12', state: 'OPEN' })}\n` },
    [`pr view 12 --json ${GATE_FIELDS}`]: dirtyGate
  };
  const outcome = await shipRun(workDir, ['--merge', '12'], scenario);
  assert.equal(outcome.code, 4, outcome.stderr);
  assert.equal(outcome.stdout, 'https://github.com/acme/widgets/pull/12 stopped gate DIRTY\n');
  assert.deepEqual(outcome.calls.filter((call) => call.startsWith('pr merge')), []);
});

test('a pull-request route on the default branch is a usage error', async () => {
  const { workDir } = await shipRepository();
  await fs.writeFile(path.join(workDir, 'body.md'), 'Adds the feature.\n');
  const outcome = await shipRun(workDir, ['--route', 'open-pr', '--title', 'feat: x', '--body', 'body.md']);
  assert.equal(outcome.code, 2, outcome.stderr);
  assert.deepEqual(outcome.calls, []);
});
