import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs } from '#script-flags';
import { frameOf, parsePlan } from '#plan-tasks';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { dispatchLines } from './review-input.mjs';
import { findingsDigest } from './merge-reviews.mjs';
import { fixedProbes } from './run-probes.mjs';
import { PROOF_TIMEOUT_MS } from './gate-constants.mjs';
import { gitOutput, runCommand, failReason, failLines } from './gate-command.mjs';

const REPAIR_BOUND = 2;

const REPAIR_REVIEW_LINE = 'REVIEW Branch repair: review-branch';

const COMMIT_SEPARATOR = '\u001e';

const FIELD_SEPARATOR = '\u001f';

const GUARD_WITHOUT_REASON = /^none(?!\s*\(\s*[^\s)])/i;

const GUARD_TEST_FILE = /^tests\/[^/]+\.test\.mjs$/;

function bodyField(body, name) {
  return body.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim().replace(/^`|`$/g, '') ?? null;
}

function repairCommits(root, preFixSha) {
  const log = gitOutput(root, ['log', `--format=%h${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR}`, `${preFixSha}..HEAD`]);
  return log.split(COMMIT_SEPARATOR).map((entry) => entry.trim()).filter((entry) => entry !== '').map((entry) => {
    const [sha, body] = entry.split(FIELD_SEPARATOR);
    return { sha, sweep: bodyField(body, 'Sweep'), guard: bodyField(body, 'Guard') };
  });
}

function missingFields({ sweep, guard }) {
  return [sweep === null ? 'Sweep:' : null, guard === null || GUARD_WITHOUT_REASON.test(guard) ? 'Guard:' : null].filter((field) => field !== null);
}

function namedGuards(commits) {
  return commits.map(({ guard }) => guard).filter((guard) => guard !== null && !/^none\b/i.test(guard));
}

function guardLines(commits, diffFiles) {
  const incomplete = commits.filter((commit) => missingFields(commit).length > 0);
  return [
    ...incomplete.map((commit) => `FAIL fixer-no-guard (commit ${commit.sha} lacks ${missingFields(commit).join(' and ')})`),
    ...namedGuards(commits).filter((guard) => !diffFiles.includes(guard)).map((guard) => `FAIL fixer-guard-not-in-diff (${guard} is not in the repair diff)`)
  ];
}

async function repairTestLines(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const lines = [];
  for (const file of files) {
    const run = await runCommand(`node --test ${file}`, timeoutMs, env);
    if (!run.ok) lines.push(...failLines(`repair-test ${file}`, failReason(run), run.output));
  }
  return lines;
}

async function recheckLines({ root, planText, diffFiles, commits }) {
  const landGate = frameOf(parsePlan(planText).frame).landGate;
  const lines = [];
  if (landGate !== null && landGate !== 'none') {
    const run = await runCommand(landGate, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS), process.env);
    if (!run.ok) lines.push(...failLines(`repair-static ${landGate}`, failReason(run), run.output));
  }
  const guardTests = namedGuards(commits).filter((guard) => GUARD_TEST_FILE.test(guard));
  const tests = [...new Set([...coveringTests(root, diffFiles), ...guardTests])];
  lines.push(...await repairTestLines(tests));
  return lines.length === 0 ? [`PASS repair-recheck (${landGate ?? 'no Land gate'}; ${tests.length} test file${tests.length === 1 ? '' : 's'})`] : lines;
}

function fixDiffDispatch({ root, planPath, preFixSha }) {
  const [branch] = dispatchLines([REPAIR_REVIEW_LINE], { root, planPath, base: preFixSha, head: 'HEAD' });
  return branch.replace('DISPATCH Branch:', 'DISPATCH Repair:').replace('scope=branch', 'scope=fix-diff').replace(/ findings=\S+/, ` findings=${path.join(path.resolve(root), '.exo', 'fix-review.md')}`).replace(/ ledger=\S+/, '');
}

function repairPasses(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.exo', 'verify-state.json'), 'utf8')).repairPasses ?? 0;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

export function recordRepairPasses(root, repairPasses) {
  const file = path.join(root, '.exo', 'verify-state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ repairPasses })}\n`);
}

function loopLines(round, failed) {
  if (!failed) return [`LOOP next=done round=${round}/${REPAIR_BOUND}`];
  if (round < REPAIR_BOUND) return [`LOOP next=fix round=${round}/${REPAIR_BOUND}`];
  return ['STOP repair-bound', `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
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
  if (passes >= REPAIR_BOUND) return ['STOP repair-bound', `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
  const { lines: problems, commits, diffFiles } = handbackLines({ root, preFixSha, findings, findingsSha256 });
  const lines = problems.length === 0 ? ['PASS fixer-committed'] : problems;
  if (problems.length === 0 && commits.length > 0) {
    lines.push(...await recheckLines({ root, planText, diffFiles, commits }));
    if (!lines.some((line) => line.startsWith('FAIL '))) lines.push(fixDiffDispatch({ root, planPath, preFixSha }));
  }
  recordRepairPasses(root, passes + 1);
  return [...lines, ...loopLines(passes + 1, lines.some((line) => line.startsWith('FAIL ')))];
}
