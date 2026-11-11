import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { wholeSuiteKeys } from '#suite-command';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { decide as budgetDecision, formatLine, recordRound, roundCap } from '../../../lib/loop-budget.mjs';
import { decide, stopLine } from './gate-decide.mjs';
import { dispatchLines } from './review-input.mjs';
import { findingsDigest } from './merge-reviews.mjs';
import { fixedProbes } from './run-probes.mjs';
import { PROOF_TIMEOUT_MS } from './gate-constants.mjs';
import { runCheck } from '../../../lib/run-check.mjs';
import { guardLines, lapMs, ledgerDirOf, namedGuards, recordReviewRound, repairCommits, roundsRun, settleRound, writePending } from './repair-round.mjs';
import { gitOutput, failReason, failLines } from './gate-command.mjs';

const JUDGE_PATH = /^(skills\/build\/scripts\/look\.mjs|skills\/gate\/scripts\/run-probes\.mjs|skills\/gate\/references\/(?:review[^/]*|triage\.md|plan-checks\.md)|lib\/agent-modes\/claims-mode\.md|agents\/[^/]*review[^/]*)$/;

const PROOF_TEST = /tests\/[^\s`]+\.test\.mjs/g;

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

function judgeTouched(planText, diffFiles) {
  const proofTests = parsePlan(planText).tasks.flatMap((task) => task.proof?.match(PROOF_TEST) ?? []);
  return diffFiles.some((file) => JUDGE_PATH.test(file) || proofTests.includes(file));
}

export function fullFailLines(root, planPath) {
  const dir = ledgerDirOf(root, planPath);
  const decision = budgetDecision(dir, 'review');
  if (decision.verdict === 'STOP') return [stopLine(), formatLine('review', decision)];
  recordRound(dir, { kind: 'review', openAfter: 1, wallMs: lapMs(dir) });
  return [decide('FAIL', 'gate fail')];
}

function loopLines(kindDecision, failed, ran) {
  const line = formatLine('fix', kindDecision);
  const cap = roundCap('fix');
  const round = Number(kindDecision.reason.match(/^round (\d+)/)?.[1] ?? ran);
  if (!failed) return [line, `LOOP next=done round=${round}/${cap}`];
  if (kindDecision.verdict === 'CONTINUE') return [line, `LOOP next=fix round=${round}/${cap}`];
  return [stopLine(), line, `LOOP next=stop round=${ran}/${cap}`];
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
  const dir = ledgerDirOf(root, planPath);
  const before = budgetDecision(dir, 'fix');
  if (before.verdict === 'STOP') return [stopLine(), formatLine('fix', before), `LOOP next=stop round=${roundsRun(dir, 'fix')}/${roundCap('fix')}`];
  const round = Number(before.reason.match(/^round (\d+)/)[1]);
  const { lines: problems, commits, diffFiles } = handbackLines({ root, preFixSha, findings, findingsSha256 });
  const lines = problems.length === 0 ? ['PASS fixer-committed'] : problems;
  const fixBefore = fixedProbes(fs.readFileSync(findings, 'utf8')).length;
  if (problems.length > 0 || commits.length === 0) recordRound(dir, { kind: 'fix', openBefore: fixBefore, openAfter: fixBefore, wallMs: lapMs(dir) });
  if (problems.length === 0 && commits.length > 0) {
    lines.push(...await recheckLines({ root, planText, diffFiles, commits, last: round >= roundCap('fix') }));
    const checksGreen = !lines.some((line) => line.startsWith('FAIL '));
    const fixAfter = fixedProbes(fs.readFileSync(findings, 'utf8')).filter((probe) => probe.unmarked).length;
    const shas = commits.map(({ sha }) => sha);
    const settled = { root, planPath, round, commits: shas, preFixSha, fixBefore, fixAfter, judgeTouched: judgeTouched(planText, diffFiles) };
    if (checksGreen) writePending(dir, settled);
    if (!checksGreen) lines.push(...settleRound({ ...settled, checksGreen }));
    if (checksGreen) lines.push(fixDiffDispatch({ root, planPath, preFixSha }));
  }
  const after = budgetDecision(dir, 'fix');
  const failed = lines.some((line) => line.startsWith('FAIL '));
  return [...lines, ...loopLines(failed ? after : { ...after, reason: `round ${round}` }, failed, roundsRun(dir, 'fix'))];
}
