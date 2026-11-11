import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { wholeSuiteKeys } from '#suite-command';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { repairBound } from '../../../lib/run-outcomes.mjs';
import { decide, stopLine } from './gate-decide.mjs';
import { dispatchLines } from './review-input.mjs';
import { findingsDigest } from './merge-reviews.mjs';
import { fixedProbes } from './run-probes.mjs';
import { PROOF_TIMEOUT_MS } from './gate-constants.mjs';
import { runCheck } from '../../../lib/run-check.mjs';
import { budgetLine, budgetSpent, guardLines, namedGuards, repairCommits, settleRound, writePending } from './repair-round.mjs';
import { gitOutput, failReason, failLines } from './gate-command.mjs';

const REPAIR_BOUND = repairBound();

const GUARD_TEST_FILE = /^tests\/[^/]+\.test\.mjs$/;

const REPAIR_REVIEW_LINE = 'REVIEW Branch repair: review-branch';

function checkReason(run, timeoutMs) {
  return failReason({ code: run.code, signal: run.signal ?? null, timedOutMs: run.timedOut ? timeoutMs : undefined });
}

async function repairTestLines(root, files) {
  const testContext = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const lines = [];
  for (const file of files) {
    const run = runCheck(root, `node --test ${file}`, { timeoutMs });
    if (!run.ok) lines.push(...failLines(`repair-test ${file}`, checkReason(run, timeoutMs), run.output));
  }
  if (testContext !== undefined) process.env.NODE_TEST_CONTEXT = testContext;
  return lines;
}

async function recheckLines({ root, planText, diffFiles, commits, last }) {
  const landGate = frameOf(parsePlan(planText).frame).landGate;
  const lines = [];
  if (landGate !== null && landGate !== 'none' && (last || wholeSuiteKeys(landGate).length === 0)) {
    const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
    const run = runCheck(root, landGate, { timeoutMs });
    if (!run.ok) lines.push(...failLines(`repair-static ${landGate}`, checkReason(run, timeoutMs), run.output));
  }
  const guardTests = namedGuards(commits).filter((guard) => GUARD_TEST_FILE.test(guard));
  const tests = [...new Set([...coveringTests(root, diffFiles), ...guardTests])];
  lines.push(...await repairTestLines(root, tests));
  return lines.length === 0 ? [`PASS repair-recheck (${landGate ?? 'no Land gate'}; ${tests.length} test file${tests.length === 1 ? '' : 's'})`] : lines;
}

function fixDiffDispatch({ root, planPath, preFixSha }) {
  const [branch] = dispatchLines([REPAIR_REVIEW_LINE], { root, planPath, base: preFixSha, head: 'HEAD' });
  return branch.replace('DISPATCH Branch:', 'DISPATCH Repair:').replace('scope=branch', 'scope=fix-diff').replace(/ findings=\S+/, ` findings=${path.join(path.resolve(root), '.exo', 'fix-review.md')}`).replace(/ ledger=\S+/, '');
}

function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.exo', 'verify-state.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeState(root, state) {
  const file = path.join(root, '.exo', 'verify-state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
}

function repairPasses(root) {
  return readState(root).repairPasses ?? 0;
}

export function recordRepairPasses(root, repairPasses) {
  const state = { ...readState(root), repairPasses };
  writeState(root, repairPasses === 0 ? { ...state, failRepairs: 0 } : state);
}

export function recordGateStart(root, startedAt = Date.now()) {
  writeState(root, { ...readState(root), gateStartedAt: startedAt });
}

export function fullFailLines(root) {
  const state = readState(root);
  const failRepairs = state.failRepairs ?? 0;
  if (failRepairs >= REPAIR_BOUND) return [stopLine()];
  writeState(root, { ...state, failRepairs: failRepairs + 1 });
  return [decide('FAIL', 'gate fail')];
}

function loopLines(round, failed) {
  if (!failed) return [`LOOP next=done round=${round}/${REPAIR_BOUND}`];
  if (round < REPAIR_BOUND) return [`LOOP next=fix round=${round}/${REPAIR_BOUND}`];
  return [stopLine(), `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
}

function handbackLines({ root, preFixSha, findings, findingsSha256 }) {
  const lines = [];
  if (findingsDigest(fs.readFileSync(findings, 'utf8')) !== findingsSha256) lines.push(`FAIL stale-findings (a finding line in ${findings} changed since merge-reviews printed ${findingsSha256})`);
  const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter((line) => line !== '' && !line.slice(3).startsWith('.exo/'));
  if (dirty.length > 0) lines.push(`FAIL fixer-uncommitted (${dirty.length} changed path${dirty.length === 1 ? '' : 's'} after the fixer returned)`, ...dirty.map((line) => `  ${line}`));
  const fixed = fixedProbes(fs.readFileSync(findings, 'utf8')).filter((probe) => !probe.unmarked).length;
  const commits = repairCommits(root, preFixSha);
  if (fixed > 0 && commits.length === 0) lines.push(`FAIL fixer-no-commits (${fixed} fixed, no commit since ${preFixSha})`);
  const diffFiles = gitOutput(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', `${preFixSha}..HEAD`]).split('\n').filter((file) => file !== '');
  lines.push(...guardLines(commits, diffFiles));
  return { lines, commits, diffFiles };
}

export async function repairLines({ root, planText, planPath, preFixSha, findings, findingsSha256 }) {
  const passes = repairPasses(root);
  if (budgetSpent(readState(root).gateStartedAt)) return [budgetLine(), `LOOP next=stop round=${passes}/${REPAIR_BOUND}`];
  if (passes >= REPAIR_BOUND) return [stopLine(), `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
  const { lines: problems, commits, diffFiles } = handbackLines({ root, preFixSha, findings, findingsSha256 });
  const lines = problems.length === 0 ? ['PASS fixer-committed'] : problems;
  if (problems.length === 0 && commits.length > 0) {
    lines.push(...await recheckLines({ root, planText, diffFiles, commits, last: passes + 1 >= REPAIR_BOUND }));
    const checksGreen = !lines.some((line) => line.startsWith('FAIL '));
    const fixBefore = fixedProbes(fs.readFileSync(findings, 'utf8')).length;
    const fixAfter = fixedProbes(fs.readFileSync(findings, 'utf8')).filter((probe) => probe.unmarked).length;
    const shas = commits.map(({ sha }) => sha);
    if (checksGreen) writePending(root, { round: passes + 1, commits: shas, preFixSha, fixBefore, fixAfter });
    if (!checksGreen) lines.push(...settleRound({ root, round: passes + 1, commits: shas, checksGreen, fixBefore, fixAfter }));
    if (checksGreen) lines.push(fixDiffDispatch({ root, planPath, preFixSha }));
  }
  recordRepairPasses(root, passes + 1);
  return [...lines, ...loopLines(passes + 1, lines.some((line) => line.startsWith('FAIL ')))];
}
