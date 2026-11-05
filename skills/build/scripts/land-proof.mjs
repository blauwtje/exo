import fs from 'node:fs';
import path from 'node:path';
import { runTreeSync } from '#process-tree';
import { environmentMs } from '#script-flags';
import { cachedPass, recordPass, workingTreeKey } from '#check-cache';
import { ensureServices } from '../../../lib/services.mjs';
import { coveringTests } from '../../../lib/covering-tests.mjs';
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
  const proofRun = runTreeSync(command, { cwd: root, timeoutMs: deadlineMs, env: proofEnvOf(task, pendingEvidence) });
  if (quiet.file !== null) quiet.proofOutput += `${command}\n${proofRun.output}\n`;
  const tail = proofRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return { proofRun, deadlineMs, tail, passed: proofRun.status === 0 && !proofRun.timedOut };
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
  return `exit ${proofRun.status}`;
}

export function runProof(task, command, { root, field, docker, pendingEvidence }) {
  if (cachedPass(root, command) !== null) return { command, tail: ['  passed already on this tree, not rerun'] };
  const before = workingTreeKey(root);
  const started = Date.now();
  let attempt = proofAttempt(task, command, root, pendingEvidence);
  if (!attempt.passed && startedServices(root, docker)) attempt = proofAttempt(task, command, root, pendingEvidence);
  if (attempt.passed) {
    recordPass(root, command, Date.now() - started, before);
    return { command, tail: attempt.tail };
  }
  throw new LandingError([`Task ${task.number}: the ${field}: command "${command}" failed (${proofFailure(attempt)}):`, ...attempt.tail].join('\n'));
}

const TEST_FILE = /^tests\/[\w.-]+\.test\.mjs$/;

function namedTestFiles(task, proofCommands, { root, planPath }) {
  const named = [...changedPaths(root, planPath), ...task.files.map((file) => file.path)];
  return [...new Set(named)].filter((file) => TEST_FILE.test(file)
    && fs.existsSync(path.join(root, file))
    && !proofCommands.some((command) => command.includes(file)));
}

function testFileFailure(task, file, root, pendingEvidence) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const { NODE_TEST_CONTEXT, ...env } = proofEnvOf(task, pendingEvidence);
  const testRun = runTreeSync(`node --test ${file}`, { cwd: root, timeoutMs: deadlineMs, env });
  if (quiet.file !== null) quiet.proofOutput += `node --test ${file}\n${testRun.output}\n`;
  if (testRun.status === 0 && !testRun.timedOut) return null;
  const reason = testRun.timedOut ? `timed out after ${deadlineMs / 1000}s` : `exit ${testRun.status}`;
  const tail = testRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return [`${file} failed (${reason}):`, ...tail].join('\n');
}

export function runNamedTests(task, proofCommands, options) {
  for (const file of namedTestFiles(task, proofCommands, options)) {
    const failure = testFileFailure(task, file, options.root, options.pendingEvidence);
    if (failure !== null) throw new LandingError(`Task ${task.number}: the test file ${failure}`);
  }
}

export function runCoveringTests(task, proofCommands, root, changed, pendingEvidence) {
  const failures = coveringTests(root, changed)
    .filter((file) => !proofCommands.some((command) => command.includes(file)))
    .map((file) => testFileFailure(task, file, root, pendingEvidence))
    .filter((failure) => failure !== null);
  if (failures.length === 0) return;
  throw new LandingError([`Task ${task.number}: ${failures.length} covering test(s) of the changed files failed:`, ...failures].join('\n'));
}
