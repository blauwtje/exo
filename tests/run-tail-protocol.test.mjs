import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runTail } from '../skills/build/scripts/run-tail.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const answer = (stdout = '', status = 0) => ({ status, stdout, stderr: '' });
const scriptOf = (file) => path.basename(file, '.mjs');
const flagValue = (args, flag) => args[args.indexOf(flag) + 1];
const promptValue = (prompt, label) => prompt.match(new RegExp(`^- ${label}: (.*)$`, 'm'))?.[1];

function checkout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tail-protocol-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'a@b.c');
  git(root, 'config', 'user.name', 'a');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'seed');
  return root;
}

const branchDispatch = (root, suffix = '') => `DISPATCH Branch${suffix}: plan=p base=main scope=branch main..HEAD`;

function scenario({ root, verifyDispatch, merged, repair = '', fixer = 'commit', replies = () => undefined }) {
  const calls = [];
  const prompts = [];
  const exec = (script, args) => {
    const name = scriptOf(script);
    calls.push({ name, args });
    const reply = replies(name, args);
    if (reply !== undefined) return reply;
    if (name === 'gate' && args.includes('--reviews-only')) return answer(verifyDispatch);
    if (name === 'gate' && args.includes('--repair')) return answer(repair);
    if (name === 'merge-reviews') return answer(merged);
    return answer();
  };
  const runSession = async ({ kind, prompt }) => {
    prompts.push({ kind, prompt });
    if (kind === 'review') {
      const findings = promptValue(prompt, 'Findings path');
      fs.mkdirSync(path.dirname(findings), { recursive: true });
      fs.writeFileSync(findings, 'CLEAN\n');
      return { resultText: 'verdict=CLEAN defect=0 concern=0 question=0 note=0 fix=0' };
    }
    if (fixer === 'commit') {
      fs.writeFileSync(path.join(root, 'a.txt'), 'fixed\n');
      git(root, 'commit', '-q', '-am', 'fix(x): repair');
    }
    return { resultText: 'fixed=1 reported=0' };
  };
  const run = (extra = {}) => runTail({ planPath: path.join(root, 'plan.md'), plan: { frame: {}, tasks: [] }, root, base: 'main', branch: 'feat', runSession, exec, ...extra });
  return { calls, prompts, run };
}

const FINDINGS = 'verdict=FINDINGS defect=1 concern=0 question=0 note=0 fix=1 report=r\nFINDINGS-SHA abc123\nCODEX none\n';
const REVIEW_LINE = 'REVIEW Branch main..HEAD: review-branch\n';

test('merge-reviews gets the run base as --base', async () => {
  const root = checkout();
  const { calls, run } = scenario({ root, verifyDispatch: `${REVIEW_LINE}${branchDispatch(root)} findings=${root}/.exo/review-branch.md\n`, merged: 'verdict=CLEAN defect=0 concern=0 question=0 note=0 fix=0 report=r\nFINDINGS-SHA abc\n' });
  await run();
  const merge = calls.find((call) => call.name === 'merge-reviews');
  assert.equal(flagValue(merge.args, '--base'), 'main');
});

test('a merge-reviews run with no verdict line stops the run instead of passing it', async () => {
  const root = checkout();
  const { run } = scenario({ root, verifyDispatch: `${REVIEW_LINE}${branchDispatch(root)} findings=${root}/.exo/review-branch.md\n`, merged: 'merge-reviews: git diff main...HEAD failed\n' });
  const result = await run();
  assert.match(result.stop?.line ?? '', /merge-reviews failed/);
});

test('a sharded branch review dispatches one reviewer per shard with its input and merges every shard report', async () => {
  const root = checkout();
  const verifyDispatch = `${REVIEW_LINE}${branchDispatch(root, ' 1/2')} input=${root}/.exo/review-input-1.md findings=${root}/.exo/review-branch-1.md\n${branchDispatch(root, ' 2/2')} input=${root}/.exo/review-input-2.md findings=${root}/.exo/review-branch-2.md\n`;
  const { calls, prompts, run } = scenario({ root, verifyDispatch, merged: 'verdict=CLEAN defect=0 concern=0 question=0 note=0 fix=0 report=r\nFINDINGS-SHA abc\n' });
  await run();
  const reviews = prompts.filter((entry) => entry.kind === 'review');
  assert.deepEqual(reviews.map((entry) => promptValue(entry.prompt, 'Input')).sort(), [`${root}/.exo/review-input-1.md`, `${root}/.exo/review-input-2.md`]);
  assert.deepEqual(reviews.map((entry) => promptValue(entry.prompt, 'Findings path')).sort(), [`${root}/.exo/review-branch-1.md`, `${root}/.exo/review-branch-2.md`]);
  const merge = calls.find((call) => call.name === 'merge-reviews');
  const reports = merge.args.flatMap((arg, index) => (arg === '--report' ? [merge.args[index + 1]] : []));
  assert.deepEqual(reports.sort(), [`${root}/.exo/review-branch-1.md`, `${root}/.exo/review-branch-2.md`]);
});

async function repairedRun({ repair, fixer, replies }) {
  const root = checkout();
  const preFix = git(root, 'rev-parse', 'HEAD');
  const verifyDispatch = `${REVIEW_LINE}${branchDispatch(root)} findings=${root}/.exo/review-branch.md\n`;
  const played = scenario({ root, verifyDispatch, merged: FINDINGS, repair, fixer, replies });
  const result = await played.run();
  return { ...played, result, preFix, root };
}

const REPAIR_OK = 'PASS fixer-committed\nPASS repair-recheck (no Land gate; 1 test file)\nDISPATCH Repair: plan=p base=x scope=fix-diff findings=f\nLOOP next=done round=1/2\n';

test('a committed fix is checked with verify --repair and reviewed as the diff since the pre-fix commit', async () => {
  const { calls, prompts, result, preFix } = await repairedRun({ repair: REPAIR_OK });
  const repair = calls.find((call) => call.name === 'gate' && call.args.includes('--repair'));
  assert.equal(flagValue(repair.args, '--pre-fix-sha'), preFix);
  assert.equal(flagValue(repair.args, '--findings-sha256'), 'abc123');
  const fixReview = prompts.filter((entry) => entry.kind === 'review').at(-1);
  assert.equal(promptValue(fixReview.prompt, 'Scope'), `fix diff ${preFix}..HEAD`);
  assert.equal(result.stop, undefined);
});

test('a committed fix is not landed again', async () => {
  const { calls, result } = await repairedRun({ repair: REPAIR_OK });
  assert.equal(calls.some((call) => call.name === 'land-task'), false);
  assert.ok(result.gate);
});

test('a fixer that commits nothing skips the fix review', async () => {
  const { prompts, result } = await repairedRun({ repair: 'PASS fixer-committed\nLOOP next=done round=1/2\n', fixer: 'none' });
  assert.equal(prompts.filter((entry) => entry.kind === 'review').length, 1);
  assert.equal(result.stop, undefined);
});

test('a FAIL line from verify --repair is a fix failure that stops the run', async () => {
  const { result } = await repairedRun({ repair: 'FAIL fixer-no-guard (x)\nLOOP next=fix round=1/2\n' });
  assert.match(result.stop?.line ?? '', /fixer-no-guard/);
});

test('a stop from verify --repair stops the run', async () => {
  const { result } = await repairedRun({ repair: 'STOP repair-bound\nLOOP next=stop round=2/2\n' });
  assert.match(result.stop?.line ?? '', /repair-bound/);
});

const CRASH = { status: 1, stdout: '', stderr: 'TypeError: boom\n' };
const USAGE = { status: 2, stdout: '', stderr: "gate: flag '--plan' needs a path\n" };
const isGate = (name, args) => name === 'gate' && !args.includes('--reviews-only') && !args.includes('--repair');
const afterFix = (target, reply) => {
  let fixed = false;
  return (name, args) => {
    if (name === 'gate' && args.includes('--repair')) fixed = true;
    if (fixed && target(name, args)) return reply;
    return undefined;
  };
};

const SWEPT_CALLS = [
  ['gate --reviews-only', (name, args) => name === 'gate' && args.includes('--reviews-only')],
  ['merge-reviews', (name) => name === 'merge-reviews'],
  ['gate --repair', (name, args) => name === 'gate' && args.includes('--repair')],
  ['gate', isGate],
  ['run-probes', (name) => name === 'run-probes']
];

for (const [command, target] of SWEPT_CALLS) {
  for (const [kind, reply] of [['crash', CRASH], ['usage error', USAGE]]) {
    test(`a ${kind} of ${command} stops the run with a reason naming it`, async () => {
      const gateCall = command === 'gate';
      const { result } = await repairedRun({ repair: REPAIR_OK, replies: gateCall ? afterFix(target, reply) : (name, args) => (target(name, args) ? reply : undefined) });
      assert.ok(result.stop, `${command} ${kind} must stop the run`);
      assert.ok(result.stop.line.includes(command), result.stop.line);
      assert.equal(result.gate, undefined);
    });
  }
}

test('a crash of the gate re-run after a failing fix stops the run with a reason naming verify', async () => {
  let gates = 0;
  const replies = (name, args) => {
    if (!isGate(name, args)) return undefined;
    gates += 1;
    return gates === 1 ? answer('FAIL check (x)\n', 1) : CRASH;
  };
  const { result } = await repairedRun({ repair: REPAIR_OK, replies });
  assert.match(result.stop?.line ?? '', /^gate failed: exit 1/);
});
