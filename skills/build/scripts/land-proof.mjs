import fs from 'node:fs';
import path from 'node:path';
import { runCheck } from '#run-check';
import { environmentMs } from '#script-flags';
import { cachedPass, gateRefusal, recordPass, workingTreeKey } from '#check-cache';
import { isWorktreePath } from '#checkout';
import { LandingError } from './land-errors.mjs';
import { withoutRunVariables } from '#process-tree';
import { PROOF_TIMEOUT_MS, PROOF_TAIL_LINES } from './land-report.mjs';
import { changedPaths } from './land-paths.mjs';
import { LEGACY_EXO_FOLDER } from '#scratch-path';

function proofAttempt(command, { root }) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const outcome = runCheck(root, command, { timeoutMs: deadlineMs, env: withoutRunVariables(), fresh: true, record: false });
  const proofRun = { status: outcome.code, signal: outcome.signal, timedOut: outcome.timedOut, error: outcome.error, output: outcome.output };
  const tail = proofRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return { command, proofRun, deadlineMs, tail, passed: proofRun.status === 0 && !proofRun.timedOut && gateRefusal(command, proofRun.output) === null };
}

function proofFailure(attempt) {
  const { proofRun, deadlineMs } = attempt;
  if (proofRun.timedOut) return `timed out after ${deadlineMs / 1000}s`;
  if (proofRun.error !== undefined) return `spawn error ${proofRun.error.message}`;
  if (proofRun.signal !== null) return `signal ${proofRun.signal}`;
  if (proofRun.status === 0) return `exit 0 but ${gateRefusal(attempt.command, proofRun.output)}`;
  return `exit ${proofRun.status}`;
}

export function runProof(task, command, options) {
  const { root } = options;
  if (cachedPass(root, command) !== null) return { command, tail: ['  passed already on this tree, not rerun'] };
  const before = workingTreeKey(root);
  const started = Date.now();
  const attempt = proofAttempt(command, options);
  if (attempt.passed) {
    recordPass(root, command, { ms: Date.now() - started, before, output: attempt.proofRun.output });
    return { command, tail: attempt.tail };
  }
  throw new LandingError([`Task ${task.number}: the Proof: command "${command}" failed (${proofFailure(attempt)}):`, ...attempt.tail].join('\n'));
}

const TEST_FILE = /^tests\/[\w.-]+\.test\.mjs$/;

function namedTestFiles(task, proofCommands, { root, planPath }) {
  const named = [...changedPaths(root, planPath), ...task.files.map((file) => file.path)];
  return [...new Set(named)].filter((file) => TEST_FILE.test(file)
    && fs.existsSync(path.join(root, file))
    && !proofCommands.some((command) => command.includes(file)));
}

function testRunFailure(file, testRun, deadlineMs) {
  if (testRun.status === 0 && !testRun.timedOut) return null;
  const reason = testRun.timedOut ? `timed out after ${deadlineMs / 1000}s` : `exit ${testRun.status}`;
  const tail = testRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return [`${file} failed (${reason}):`, ...tail].join('\n');
}

function testFileFailure(file, { root }) {
  const flags = projectNodeFlags(root);
  if (flags === null) return null;
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const { NODE_TEST_CONTEXT, ...env } = withoutRunVariables();
  const testRun = runCheck(root, ['node', ...flags, '--test', '--test-reporter=spec', file].join(' '), { timeoutMs: deadlineMs, env, record: false, fresh: true });
  return testRunFailure(file, { status: testRun.ok ? 0 : (testRun.code ?? 1), timedOut: testRun.timedOut, output: testRun.output }, deadlineMs);
}

export function runNamedTests(task, proofCommands, options) {
  for (const file of namedTestFiles(task, proofCommands, options)) {
    const failure = testFileFailure(file, options);
    if (failure !== null) throw new LandingError(`Task ${task.number}: the test file ${failure}`);
  }
}

export function runCoveringTests(task, proofCommands, { root, changed }) {
  const files = coveringTests(root, changed).filter((file) => !proofCommands.some((command) => command.includes(file)));
  const failures = files.map((file) => testFileFailure(file, { root })).filter((failure) => failure !== null);
  if (failures.length === 0) return;
  throw new LandingError([`Task ${task.number}: ${failures.length} covering test(s) of the changed files failed:`, ...failures].join('\n'));
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', LEGACY_EXO_FOLDER]);
const LITERAL = /(['"`])([^'"`\n]*)\1/g;

const clean = (entry) => entry.split(path.sep).join('/').replace(/^\.\//, '');

function filesUnder(root, folder) {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const child = `${relative}/${entry.name}`;
      if (isWorktreePath(child)) continue;
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(folder);
  return found;
}

function expand(root, entry) {
  const file = clean(entry);
  if (!file.endsWith('/')) return [file];
  const folder = file.replace(/\/+$/, '');
  if (!folder || !fs.existsSync(path.join(root, folder))) return [folder];
  return [folder, ...filesUnder(root, folder)];
}

function ancestors(file) {
  const parts = file.split('/');
  return parts.map((_, index) => parts.slice(0, index + 1).join('/')).filter(Boolean);
}

function formsOf(literal) {
  const trimmed = literal.replace(/\/+$/, '');
  const stripped = trimmed.replace(/^\$\{[^}]*\}\/?/, '');
  if (!/^\.\.?\//.test(stripped)) return [trimmed, stripped];
  return [trimmed, path.posix.join('tests', stripped)];
}

function literalsOf(text) {
  return new Set([...text.matchAll(LITERAL)].flatMap((match) => formsOf(match[2])));
}

function testFiles(root) {
  const directory = path.join(root, 'tests');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith('.test.mjs')).sort();
}

function readsAny(root, name, wanted) {
  const text = fs.readFileSync(path.join(root, 'tests', name), 'utf8');
  return [...literalsOf(text)].some((literal) => wanted.has(literal));
}

function coveringTests(root, paths) {
  const wanted = new Set(paths.flatMap((entry) => expand(root, entry)).flatMap(ancestors));
  const covering = testFiles(root).filter((name) => readsAny(root, name, wanted));
  return covering.map((name) => `tests/${name}`);
}

function projectNodeFlags(root) {
  let script;
  try {
    script = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts?.test;
  } catch {
    return [];
  }
  if (script === undefined) return [];
  const words = String(script).trim().split(/\s+/);
  const testAt = words.indexOf('--test');
  if (words[0] !== 'node' || testAt < 0) return null;
  return words.slice(1, testAt);
}
