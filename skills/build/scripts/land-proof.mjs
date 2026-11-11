import fs from 'node:fs';
import path from 'node:path';
import { runCheck } from '../../../lib/run-check.mjs';
import { roundCap } from '../../../lib/loop-budget.mjs';
import { environmentMs } from '#script-flags';
import { cachedPass, gateRefusal, recordPass, workingTreeKey } from '#check-cache';
import { readShadow, recordShadow, shadowSelection, trialActive } from '#suite-command';
import { changedTestsTrialRuns } from '../../../lib/context-limits.mjs';
import { ensureServices } from '../../../lib/services.mjs';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { parseTestPool, poolSize, testPoolCommand } from '../../../lib/test-pool.mjs';
import { LandingError, EnvError } from './land-errors.mjs';
import { proofEnvOf } from './land-commit-block.mjs';
import { PROOF_TIMEOUT_MS, PROOF_TAIL_LINES } from './land-report.mjs';
import { changedPaths } from './land-paths.mjs';

const QUIET_LINES = 20;
export const quiet = { file: null, proofOutput: '' };

export function quietText(text, ok) {
  const all = text.split('\n').filter((line) => line.trim() !== '');
  const lines = ok ? all.filter((line) => !/^(?:Landed|Route|Next|Then): /.test(line)) : all;
  const kept = lines.length < QUIET_LINES ? lines : [lines[0], ...lines.slice(-(QUIET_LINES - 2))];
  fs.mkdirSync(path.dirname(quiet.file), { recursive: true });
  fs.appendFileSync(quiet.file, `${ok ? '' : text.trimEnd()}\n--- full output ---\n${text}${quiet.proofOutput}`);
  return `${[...kept, `Full output: ${quiet.file}`].join('\n')}\n`;
}

function proofAttempt(task, command, root, pendingEvidence) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const outcome = runCheck(root, command, { timeoutMs: deadlineMs, env: proofEnvOf(task, pendingEvidence), fresh: true, record: false });
  const proofRun = { status: outcome.code, signal: outcome.signal, timedOut: outcome.timedOut, error: outcome.error, output: outcome.output };
  if (quiet.file !== null) quiet.proofOutput += `${command}\n${proofRun.output}\n`;
  const tail = proofRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return { command, proofRun, deadlineMs, tail, passed: proofRun.status === 0 && !proofRun.timedOut && gateRefusal(command, proofRun.output) === null };
}

function startedServices(root, docker) {
  let started = false;
  const status = ensureServices(root, { docker: { ...docker, start: () => { started = true; return docker.start(); } } });
  if (status !== 'up') throw new EnvError(`ENV: ${status.split(' ')[0]} down: ${status}`);
  return started;
}

function proofFailure(attempt) {
  const { proofRun, deadlineMs } = attempt;
  if (proofRun.timedOut) return `timed out after ${deadlineMs / 1000}s`;
  if (proofRun.error !== undefined) return `spawn error ${proofRun.error.message}`;
  if (proofRun.signal !== null) return `signal ${proofRun.signal}`;
  if (proofRun.status === 0) return `exit 0 but ${gateRefusal(attempt.command, proofRun.output)}`;
  return `exit ${proofRun.status}`;
}

const outcome = (passed) => (passed ? 'pass' : 'fail');

function shadowRun(task, command, selection, { root, pendingEvidence }, fullPassed) {
  const narrowed = selection.files.length === 0 || proofAttempt(task, selection.command, root, pendingEvidence).passed;
  recordShadow(root, { command, files: selection.files.length, narrowed: outcome(narrowed), full: outcome(fullPassed) });
}

function trialPass(task, command, selection, { root, pendingEvidence }) {
  if (selection === null || !trialActive(readShadow(root), command, changedTestsTrialRuns())) return null;
  const narrowed = selection.files.length === 0 ? null : proofAttempt(task, selection.command, root, pendingEvidence);
  if (narrowed !== null && !narrowed.passed) return null;
  recordShadow(root, { command, files: selection.files.length, narrowed: 'pass', full: 'skipped' });
  return { command, tail: narrowed === null ? ['  no changed tests, full suite skipped'] : [...narrowed.tail, '  changed tests only, full suite skipped'] };
}

export function runProof(task, command, options) {
  const { root, field, docker, pendingEvidence } = options;
  if (cachedPass(root, command) !== null) return { command, tail: ['  passed already on this tree, not rerun'] };
  const selection = shadowSelection(root, command);
  const trial = trialPass(task, command, selection, options);
  if (trial !== null) return trial;
  const before = workingTreeKey(root);
  const started = Date.now();
  let attempt = proofAttempt(task, command, root, pendingEvidence);
  if (!attempt.passed && roundCap('proof') > 1 && startedServices(root, docker)) attempt = proofAttempt(task, command, root, pendingEvidence);
  if (attempt.passed) recordPass(root, command, Date.now() - started, before, attempt.proofRun.output);
  if (selection !== null) shadowRun(task, command, selection, options, attempt.passed);
  if (attempt.passed) return { command, tail: attempt.tail };
  throw new LandingError([`Task ${task.number}: the ${field}: command "${command}" failed (${proofFailure(attempt)}):`, ...attempt.tail].join('\n'));
}

const TEST_FILE = /^tests\/[\w.-]+\.test\.mjs$/;

function namedTestFiles(task, proofCommands, { root, planPath }) {
  const named = [...changedPaths(root, planPath), ...task.files.map((file) => file.path)];
  return [...new Set(named)].filter((file) => TEST_FILE.test(file)
    && fs.existsSync(path.join(root, file))
    && !proofCommands.some((command) => command.includes(file)));
}

function testRunFailure(file, testRun, deadlineMs) {
  if (quiet.file !== null) quiet.proofOutput += `node --test ${file}\n${testRun.output}\n`;
  if (testRun.status === 0 && !testRun.timedOut) return null;
  const reason = testRun.timedOut ? `timed out after ${deadlineMs / 1000}s` : `exit ${testRun.status}`;
  const tail = testRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return [`${file} failed (${reason}):`, ...tail].join('\n');
}

function testFileFailure(task, file, root, pendingEvidence) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const { NODE_TEST_CONTEXT, ...env } = proofEnvOf(task, pendingEvidence);
  const testRun = runCheck(root, `node --test --test-reporter=spec ${file}`, { timeoutMs: deadlineMs, env, record: false, fresh: true });
  return testRunFailure(file, { status: testRun.ok ? 0 : (testRun.code ?? 1), timedOut: testRun.timedOut, output: testRun.output }, deadlineMs);
}

function parallelFailures(task, files, root, pendingEvidence) {
  if (files.length === 0) return [];
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const { NODE_TEST_CONTEXT, ...env } = proofEnvOf(task, pendingEvidence);
  const waves = Math.ceil(files.length / poolSize(files.length));
  const pool = runCheck(root, testPoolCommand(files), { timeoutMs: deadlineMs * waves, env: { ...env, EXO_TEST_POOL_TIMEOUT_MS: String(deadlineMs) }, record: false, fresh: true });
  const results = pool.ok ? parseTestPool(pool.output) : null;
  if (results === null) return files.map((file) => testFileFailure(task, file, root, pendingEvidence));
  return results.map((result) => testRunFailure(result.file, result, deadlineMs));
}

export function runNamedTests(task, proofCommands, options) {
  for (const file of namedTestFiles(task, proofCommands, options)) {
    const failure = testFileFailure(task, file, options.root, options.pendingEvidence);
    if (failure !== null) throw new LandingError(`Task ${task.number}: the test file ${failure}`);
  }
}

export function runCoveringTests(task, proofCommands, root, changed, pendingEvidence) {
  const files = coveringTests(root, changed).filter((file) => !proofCommands.some((command) => command.includes(file)));
  const failures = parallelFailures(task, files, root, pendingEvidence).filter((failure) => failure !== null);
  if (failures.length === 0) return;
  throw new LandingError([`Task ${task.number}: ${failures.length} covering test(s) of the changed files failed:`, ...failures].join('\n'));
}
