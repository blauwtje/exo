import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { dataLiterals, literalFinder } from '#data-literals';
import { exportSignatures } from '#export-signatures';
import { runTreeSync, withoutRunVariables } from '#process-tree';
import { LandLockError, withLandLock } from '#land-lock';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { BLOCK_TASK_LIMIT, coversCompanion, decisionsPathOf, defaultBase, frameOf, isCovered, isolatedCheckout, isPlanDoc, landedTasks, nextWave, parsePlan, PlanError, planIdOf, planRoute, planTaskTrailer, proofRecordPath, routeLine, waveLine } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { cachedPass, lastPassMs, recordPass, SLOW_GATE_MS, workingTreeKey } from '#check-cache';
import { mcpToolCall } from '#mcp-tool-call';
import { nextTaskReport, refreshProgress } from './next-task.mjs';
import { isTestFirst, runOnBase, testPaths } from '#red-green';
import { CODE_RULE_LIMITS, codeRuleFindings } from '#code-rules';
import { attributionProblem, subjectProblem } from '#commit-text';
import { refusalHandler } from '../../../lib/refusal-handlers.mjs';
import { dockerHost, ensureServices } from '../../../lib/services.mjs';
import { coveringTests } from '../../../lib/covering-tests.mjs';

export class LandingError extends Error {
  kind = 'proof failed';
}

export class PlanDriftError extends LandingError {
  kind = 'plan drift';
}

export class CodeRuleError extends LandingError {
  kind = 'code rule';
}

export class EnvError extends LandingError {
  kind = 'env';
}

export class ReportMissingError extends LandingError {
  kind = 'report missing';
}

export class OutsideFilesError extends LandingError {
  kind = 'outside Files';
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function trailersOf(planId, number, signatures) {
  return [planTaskTrailer(planId, number), ...signatures.map((signature) => `Signature: ${signature}`)].join('\n');
}

function candidateTrailer(planId, number) {
  return `Plan-candidate: ${planId}/${number}`;
}

function dropsOf(task) {
  return task.section.match(/^Depends on: .*?\| Drops: ([^|\n]*?) *(?:\||$)/m)?.[1] || null;
}

// why: a Proof runs without the run's own variables, but with this task's Drops: words, as its Land gate does, so a Proof that runs the boundary-words check allows the same words.
function proofEnvOf(task) {
  const drops = dropsOf(task);
  return drops === null ? withoutRunVariables() : { ...withoutRunVariables(), EXO_DROPS: drops };
}

function deriveCommit(task, number, planId, signatures, root) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${number} has no Commit: block and no Files: to derive one from`);
  }
  // why: git add refuses a path that matches neither the index nor the tree, so a path already staged as deleted stays out of it; with rename detection off, the old path of a git mv counts as a staged deletion.
  const removed = new Set(execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D'], { encoding: 'utf8' }).split('\n'));
  const addArgs = task.files.filter((file) => !removed.has(file.path)).map((file) => shellQuote(file.path)).join(' ');
  const addLine = addArgs === '' ? '' : `git add ${addArgs}\n`;
  const drops = dropsOf(task);
  const evidence = task.evidence === null ? '' : `\nEvidence: ${task.evidence}`;
  const trailers = trailersOf(planId, number, signatures) + (drops === null ? '' : `\nDrops: ${drops}`) + evidence;
  return `${addLine}git commit -m ${shellQuote(task.title)} -m ${shellQuote(trailers)}`;
}

function parsePin(value) {
  if (value === undefined) return null;
  const match = value.match(/^([^/\s]+)\/(\d+)$/);
  if (match === null) throw new LandingError(`EXO_RUN_TASK '${value}' is not <plan-id>/<task number>`);
  return { planId: match[1], number: Number(match[2]) };
}

function refuseOutsidePin(pin, planPath, number) {
  if (pin === null) return;
  if (pin.planId !== planIdOf(planPath) || pin.number !== number) {
    throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

function refuseOtherPlan(pin, planPath, number) {
  if (pin !== null && pin.planId !== planIdOf(planPath)) {
    throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

function refuseMcpProofUnderPin(pin, task) {
  if (pin !== null && mcpProofOf(task) !== null) {
    throw new LandingError(`EXO_RUN_TASK refuses Task ${task.number}: its Proof is an MCP call, which only an interactive session can run`);
  }
}

function refuseMismatchedToplevel(root) {
  const resolvedRoot = realpathSync(root);
  const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const resolvedToplevel = realpathSync(toplevel);
  if (resolvedToplevel !== resolvedRoot) {
    throw new LandingError(`--root '${root}' is not the checkout toplevel: git rev-parse --show-toplevel there prints '${toplevel}'`);
  }
}

function refuseBadCommitText(subject, rest = '') {
  const problem = subjectProblem(subject) ?? attributionProblem(`${subject}\n${rest}`);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

export function fixLand({ root, subject, plan = null, pin = null }) {
  if (pin !== null) throw new LandingError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; --fix is refused`);
  refuseMismatchedToplevel(root);
  refuseBadCommitText(subject);
  return locked(root, () => fixLandLocked({ root, subject, plan }));
}

function fixLandLocked({ root, subject, plan }) {
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit');
  }
  if (plan !== null) runLint(frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).lint, changedPaths(root), root);
  execFileSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
  execFileSync('git', ['-C', root, 'commit', '-m', subject], { encoding: 'utf8' });
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return `Committed: ${sha}\n`;
}

export function commitBlockOf(plan, number, planId, signatures = [], root = '.') {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock !== null) {
    if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
      throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
    }
    return task.commitBlock.replace(`"Plan-task: ${number}"`, shellQuote(trailersOf(planId, number, signatures)));
  }
  if (task.compact) return deriveCommit(task, number, planId, signatures, root);
  throw new LandingError(`Task ${number} has no Commit: block`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ANY_OUTCOME_LINE = /^\s*(?:[-*]\s+)?(?:`([^`]+)`|(.+)):\s*(.*?)\s*$/;
const REPORT_FIELDS = new Set(['Landed', 'Proof', 'Unresolved']);
const PROOF_TIMEOUT_MS = 540_000;
const PROOF_TAIL_LINES = 20;
const RED_FIELD_LINE = /^\s*(?:[-*]\s+)?(?:Test first|Red):/;
function provedCommand(task, lines, reportPath) {
  if (task.proof !== null) return task.proof.replace(/^`(.*)`$/, '$1');
  for (const line of lines) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command !== undefined && match[3] !== '' && !REPORT_FIELDS.has(command)) return command;
  }
  throw new LandingError(`Task ${task.number}: no Proof: command, and the build report has no "<test>: pass" line${expectedLayout(task, reportPath)}`);
}

const FAILED_OUTCOME = /^fail(?:ed|s|ing)?\b/i;
const BARE_FAILED_OUTCOME = /^fail(?:ed)?(?:\s*\(.*\))?$/i;
const PROOF_FIELD_LINE = /^\s*(?:[-*]\s+)?Proof:\s*(.*)$/;
const SECTION_END_LINE = /^\s*(?:[-*]\s+)?(?:Landed|Unresolved|Report|Choice):/;

function proofSectionOf(lines) {
  const start = lines.findIndex((line) => PROOF_FIELD_LINE.test(line));
  const section = start === -1 ? lines : [lines[start].match(PROOF_FIELD_LINE)[1], ...lines.slice(start + 1)];
  const end = section.findIndex((line, index) => (start === -1 || index > 0) && SECTION_END_LINE.test(line));
  return end === -1 ? section : section.slice(0, end);
}

function refuseFailedCommand(task, lines) {
  for (const line of proofSectionOf(lines)) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command === undefined || REPORT_FIELDS.has(command)) continue;
    const failing = match[1] === undefined ? BARE_FAILED_OUTCOME : FAILED_OUTCOME;
    if (!failing.test(match[3])) continue;
    throw new LandingError(`Task ${task.number}: the build report lists "${command}: ${match[3]}" under Proof, no clear pass`);
  }
}

function expectedLayout(task, reportPath, command = null) {
  const written = command ?? (task.proof === null ? '<test command>' : task.proof.replace(/^`(.*)`$/, '$1'));
  const outcome = mcpProofOf(task) === null ? 'pass' : 'deferred';
  return `\nExpected under Proof: in ${reportPath}:\n${written}: ${outcome}`;
}

function reportLinesOf(task, reportText, reportPath) {
  if (reportText === null) {
    const wanted = task.proof === null ? 'a test for the Success criterion' : `"${task.proof}"`;
    throw new ReportMissingError(`Task ${task.number}: no build report at '${reportPath}' to prove ${wanted}${expectedLayout(task, reportPath)}`);
  }
  const lines = reportText.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  let redIndent = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (redIndent !== null && line.trim() !== '' && indent > redIndent) continue;
    redIndent = RED_FIELD_LINE.test(line) ? indent : null;
    if (redIndent === null) kept.push(line);
  }
  return kept;
}

function outcomesOf(command, lines) {
  const outcomeLine = new RegExp(`^(\\s*)(?:[-*]\\s+)?(?:Proof:\\s*)?\`?${escapeRegExp(command)}\`?:\\s*(.*?)\\s*$`);
  return lines.flatMap((line, index) => {
    const match = line.match(outcomeLine);
    return match === null ? [] : [{ outcome: match[2].toLowerCase(), indent: match[1].length, index }];
  });
}

export function mcpProofOf(task) {
  if (task.proof === null) return null;
  return mcpToolCall(task.proof.replace(/^`(.*)`$/, '$1'));
}

export function deferredProofOf(task, call, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const written = provedCommand(task, lines, reportPath);
  const outcomes = [...new Set([written, call])].flatMap((command) => outcomesOf(command, lines).map((entry) => ({ ...entry, command })));
  if (outcomes.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report has no "${written}: deferred" line${expectedLayout(task, reportPath, written)}`);
  }
  const undeferred = outcomes.find(({ outcome }) => !/^deferred\b/.test(outcome));
  if (undeferred !== undefined) {
    throw new LandingError(`Task ${task.number}: the build report reads "${undeferred.command}: ${undeferred.outcome}", yet only the session runs an MCP tool Proof; report it deferred`);
  }
  refuseFailedCommand(task, lines);
  return call;
}

function proofCommandOf(task, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const command = provedCommand(task, lines, reportPath);
  refuseFailedCommand(task, lines);
  return command;
}

const QUIET_LINES = 20;
const quiet = { file: null, proofOutput: '' };

function quietText(text, ok) {
  const all = text.split('\n').filter((line) => line.trim() !== '');
  const lines = ok ? all.filter((line) => !/^(?:Landed|Route|Next|Then): /.test(line)) : all;
  const kept = lines.length < QUIET_LINES ? lines : [lines[0], ...lines.slice(-(QUIET_LINES - 2))];
  fs.mkdirSync(path.dirname(quiet.file), { recursive: true });
  fs.appendFileSync(quiet.file, `${ok ? '' : text.trimEnd()}\n--- full output ---\n${text}${quiet.proofOutput}`);
  return `${[...kept, `Full output: ${quiet.file}`].join('\n')}\n`;
}

function proofAttempt(task, command, root) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const proofRun = runTreeSync(command, { cwd: root, timeoutMs: deadlineMs, env: proofEnvOf(task) });
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

function runProof(task, command, { root, field, docker }) {
  if (cachedPass(root, command) !== null) return { command, tail: ['  passed already on this tree, not rerun'] };
  const before = workingTreeKey(root);
  const started = Date.now();
  let attempt = proofAttempt(task, command, root);
  if (!attempt.passed && startedServices(root, docker)) attempt = proofAttempt(task, command, root);
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

function testFileFailure(task, file, root) {
  const deadlineMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const { NODE_TEST_CONTEXT, ...env } = proofEnvOf(task);
  const testRun = runTreeSync(`node --test ${file}`, { cwd: root, timeoutMs: deadlineMs, env });
  if (quiet.file !== null) quiet.proofOutput += `node --test ${file}\n${testRun.output}\n`;
  if (testRun.status === 0 && !testRun.timedOut) return null;
  const reason = testRun.timedOut ? `timed out after ${deadlineMs / 1000}s` : `exit ${testRun.status}`;
  const tail = testRun.output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  return [`${file} failed (${reason}):`, ...tail].join('\n');
}

function runNamedTests(task, proofCommands, options) {
  for (const file of namedTestFiles(task, proofCommands, options)) {
    const failure = testFileFailure(task, file, options.root);
    if (failure !== null) throw new LandingError(`Task ${task.number}: the test file ${failure}`);
  }
}

function runCoveringTests(task, proofCommands, root, changed) {
  const failures = coveringTests(root, changed)
    .filter((file) => !proofCommands.some((command) => command.includes(file)))
    .map((file) => testFileFailure(task, file, root))
    .filter((failure) => failure !== null);
  if (failures.length === 0) return;
  throw new LandingError([`Task ${task.number}: ${failures.length} covering test(s) of the changed files failed:`, ...failures].join('\n'));
}

const CHOICE_LINE =/^\s*(?:[-*]\s+)?Choice:\s*(.+?)\s*$/;

function appendDecisions({ planPath, reportText, taskCount, number, sha }) {
  if (planPath === undefined || reportText === null || taskCount <= BLOCK_TASK_LIMIT) return;
  const choices = reportText.replace(/\r\n/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(CHOICE_LINE);
    return match === null ? [] : [`Task ${number} ${sha}: ${match[1]}\n`];
  });
  if (choices.length > 0) fs.appendFileSync(decisionsPathOf(planPath), choices.join(''));
}

// why: a git worktree nested in the checkout is another checkout, not task output.
function nestedWorktrees(root) {
  const listed = spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (listed.status !== 0) return new Set();
  return new Set(listed.stdout.split('\n').filter((line) => line.startsWith('worktree ')).flatMap((line) => {
    try { return [realpathSync(line.slice('worktree '.length))]; } catch { return []; } // why: a prunable worktree is listed after its directory is gone.
  }));
}

function untrackedPaths(root) {
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n')
    .filter((file) => file === '' || !worktrees.has(path.join(top, file.replace(/\/$/, ''))));
}

function changedPaths(root, planPath) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const scratchPrefix = `${SCRATCH_FOLDER}/`;
  const exempt = planPath === undefined ? [] : [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  return [...new Set([...tracked.split('\n'), ...untrackedPaths(root)])]
    .filter((line) => line !== '' && !line.startsWith(scratchPrefix) && !exempt.includes(line));
}

function unplannedPaths(task, { root, planPath, siblingWork = () => false }) {
  const entries = task.files.map((file) => file.path);
  return changedPaths(root, planPath).filter((changed) => !isCovered(entries, changed) && !coversCompanion(entries, changed) && !siblingWork(changed));
}

function siblingWorkOf(plan, task, { root, planPath, landing }) {
  const written = landing && (task.commitBlock !== null || !task.compact);
  const added = written ? addedPathspecs(task.commitBlock ?? '') : [];
  if (added === null) return () => false;
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const entries = plan.tasks
    .filter((other) => other.number !== task.number && !landed.includes(other.number))
    .flatMap((other) => other.files.map((file) => file.path));
  const named = plan.tasks.flatMap((other) => other.files.map((file) => file.path));
  const staged = landing ? execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).split('\n') : [];
  const untracked = written ? new Set(untrackedPaths(root)) : null;
  const siblingFile = (changed) => isCovered(entries, changed) && (!written || (untracked.has(changed) && !isCovered(added, changed)));
  const planDoc = (changed) => isPlanDoc(changed) && !isCovered(named, changed) && !isCovered(added, changed);
  return (changed) => !staged.includes(changed) && (siblingFile(changed) || planDoc(changed));
}

const STAGES_ALL = /^(?:\.|\.\/|-A|--all|:\/|.*[*?[].*)$/;

function addedPathspecs(commitBlock) {
  const specs = [...commitBlock.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)]
    .flatMap((match) => match[1].trim().split(/\s+/))
    .map((arg) => arg.replace(/^['"]|['"]$/g, ''))
    .filter((arg) => arg !== '' && arg !== '--' && !/^-(?!A$|-all$)/.test(arg));
  if (specs.some((spec) => STAGES_ALL.test(spec))) return null;
  return specs.flatMap((spec) => [spec, `${spec.replace(/\/$/, '')}/`]);
}

function sourceAtHead(root, file) {
  const shown = spawnSync('git', ['-C', root, 'show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return shown.status === 0 ? shown.stdout : null;
}

function outsideCallers(root, name, inFiles) {
  const pathspecs = [...SCRIPT_EXTENSIONS].map((extension) => `*${extension}`);
  const found = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '-e', name, '--', ...pathspecs], { encoding: 'utf8' });
  // why: git grep exits 1 when nothing matches, so only a higher status is a failure.
  if (found.error !== undefined || found.status > 1) {
    throw new LandingError(`git grep for callers of ${name} failed: ${found.error?.message ?? found.stderr.trim()}`);
  }
  return found.stdout.split('\n').filter((file) => file !== '' && !isCovered([...inFiles], file));
}

function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

function signatureChanges(task, root) {
  const inFiles = new Set(task.files.map((file) => file.path));
  const changes = [];
  const drifts = [];
  for (const file of inFiles) {
    if (file.endsWith('/') || !SCRIPT_EXTENSIONS.has(path.extname(file))) continue;
    const before = sourceAtHead(root, file);
    const workingPath = path.join(root, file);
    if (before === null || !fs.existsSync(workingPath)) continue;
    const after = exportSignatures(fs.readFileSync(workingPath, 'utf8'));
    for (const [name, oldParameters] of exportSignatures(before)) {
      const newParameters = after.get(name);
      if (newParameters === undefined || !breaksCallers(oldParameters, newParameters)) continue;
      const change = `${file}:${name}(${oldParameters.text}) -> (${newParameters.text})`.replace(/\s+/g, ' ');
      changes.push(change);
      const callers = outsideCallers(root, name, inFiles);
      if (callers.length > 0) drifts.push(`PLAN DRIFT: Task ${task.number}: ${change}; callers outside Files: ${callers.join(', ')}`);
    }
  }
  if (drifts.length > 0) throw new PlanDriftError(drifts.join('\n'));
  return changes;
}

function runLint(lint, files, root) {
  if (lint === null || lint === 'none') return;
  const paths = files
    .filter((file) => !file.endsWith('/') && SCRIPT_EXTENSIONS.has(path.extname(file)) && fs.existsSync(path.join(root, file)));
  if (paths.length === 0) return;
  const [command, ...args] = [...lint.split(/\s+/), ...paths];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.trim();
    throw new LandingError(`Lint "${lint}" failed:\n${output}`);
  }
}

const CODE_RULE_FIXES = {
  'max-depth': 'less nesting',
  'max-params': 'one options object',
  'no-nested-ternary': 'an if or a lookup',
  'no-else-return': 'drop the else after return',
  comment: 'remove it or make the code clearer',
  suppression: 'remove it or make the code clearer',
};

function codeRuleHints(fails) {
  return Object.entries(CODE_RULE_FIXES)
    .filter(([rule]) => fails.some((fail) => fail.split(' ')[1] === rule))
    .map(([rule, fix]) => `Fix for ${rule}: ${fix}.\n`)
    .join('');
}

function runCodeRules(files, root) {
  const { fails, warns } = codeRuleFindings({ root, base: 'HEAD', paths: files.filter((file) => !file.endsWith('/')) });
  if (fails.length > 0) {
    throw new CodeRuleError(`the added code breaks the code rules:\n${fails.join('\n')}\n${codeRuleHints(fails)}The ${CODE_RULE_LIMITS}.`);
  }
  return warns.map((warn) => `Code rule warning: ${warn}\n`).join('');
}

const GATE_VARIABLES = ['EXO_DROPS', 'EXO_PENDING_EVIDENCE'];

function setGateEnv(values) {
  const outer = Object.fromEntries(GATE_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of GATE_VARIABLES) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  return () => {
    for (const name of GATE_VARIABLES) {
      if (outer[name] === undefined) delete process.env[name];
      else process.env[name] = outer[name];
    }
  };
}

function pendingEvidenceOf(plan, task, root, planId) {
  const landed = landedTasks(plan.tasks, root, planId);
  const values = plan.tasks
    .filter((other) => other.number !== task.number && !landed.includes(other.number) && other.evidence !== null)
    .map((other) => other.evidence);
  return values.length === 0 ? undefined : values.join('\n');
}

function gateEnvOf(plan, task, root, planId) {
  return { EXO_DROPS: dropsOf(task) ?? undefined, EXO_PENDING_EVIDENCE: pendingEvidenceOf(plan, task, root, planId) };
}

function runLandGate(landGate, root, gateEnv = {}) {
  if (landGate === null || landGate === 'none') return null;
  if (cachedPass(root, landGate) !== null) return `Land gate "${landGate}" skipped: it already passed on this tree.\n`;
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= SLOW_GATE_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so verify runs it once.\n`;
  }
  const before = workingTreeKey(root);
  const started = Date.now();
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const restore = setGateEnv(gateEnv);
  let gate;
  try {
    gate = runTreeSync(landGate, { cwd: root, timeoutMs: deadlineMs });
  } finally {
    restore();
  }
  if (gate.status !== 0 || gate.timedOut) {
    const timedOut = gate.timedOut ? `timed out after ${deadlineMs / 1000}s` : '';
    const output = `${gate.output}${timedOut || (gate.error?.message ?? '')}`.trim();
    throw new LandingError(`Land gate "${landGate}" failed:\n${output}`);
  }
  recordPass(root, landGate, Date.now() - started, before);
  return '';
}

const PASS_SUMMARY_LINE = /^(?:ℹ |# )?pass \d+\b|\b\d+ (?:passing|passed)\b|^Tests:/;
const TIMING_LINE = /^(?:ℹ |# )?duration_ms\b|^(?:Time|Duration|Done in)\b/;

function proofOutcomeOf(tail) {
  const lines = tail.map((line) => line.trim()).filter((line) => !TIMING_LINE.test(line));
  const outcome = lines.findLast((line) => PASS_SUMMARY_LINE.test(line)) ?? lines.at(-1) ?? 'no output';
  return `exit 0, ${outcome}`;
}

function writeProofRecord({ root, planId, number, proofs, redLine }) {
  const lines = [...proofs.map(({ command, tail }) => `Proof: \`${command}\` -> ${proofOutcomeOf(tail)}\n`), `${redLine}\n`];
  const record = proofRecordPath(root, planId, number);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, lines.join(''));
}

function taskChangedPaths(root) {
  const entries = execFileSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8' }).split('\0').filter((entry) => entry !== '');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    paths.push(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) paths.push(entries[++i]);
  }
  return paths;
}

const UNTAGGED_LOOKBACK = 20;

function untaggedBaseNote(task, root) {
  const files = task.files.map((file) => file.path);
  if (files.length === 0) return '';
  const base = defaultBase(root);
  const range = base === null ? ['-n', String(UNTAGGED_LOOKBACK), 'HEAD'] : [`${base}..HEAD`];
  const log = execFileSync('git', ['-C', root, 'log', '--no-merges', '--invert-grep', '--grep=^Plan-task: ', '--format=%h %s', ...range, '--', ...files], { encoding: 'utf8' });
  const commits = log.split('\n').filter((line) => line !== '');
  if (commits.length === 0) return '';
  return `\nBase commits touching this task's files without a Plan-task trailer: ${commits.join(', ')}; the fix may already be on the base.`;
}

function redGreenLine(task, proofCommands, root, pending) {
  if (task.red !== null) return `Red: skipped: none (${task.red.reason})`;
  if (pending !== null) return 'Red: skipped: deferred MCP proof';
  if (proofCommands.length === 0) return 'Red: skipped: no passing Bash proof command';
  const overlay = testPaths(taskChangedPaths(root));
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  let sha = '';
  for (const command of proofCommands) {
    const base = runOnBase({ root, base: 'HEAD', command, overlay, timeoutMs, headMs: cachedPass(root, command)?.ms });
    sha = base.sha.slice(0, 7);
    if (base.status === 'error') {
      throw new LandingError(`Task ${task.number}: the red-green check of "${command}" on ${sha || 'HEAD'} failed to finish:\n${base.output.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n')}`);
    }
    if (base.status === 'red') return 'Red: proved';
  }
  throw new LandingError(`Task ${task.number}: Proof passes on ${sha} without the production change: no red proof; tighten the test or add \`Red: none (<reason>)\` to the task${untaggedBaseNote(task, root)}`);
}

// why: verify's claims-diff check refuses the same commit, but only at the end of the run.
function refuseUntestedTestFirst(task, root) {
  if (isTestFirst(task) && testPaths(taskChangedPaths(root)).length === 0) {
    throw new LandingError(`Task ${task.number} is test-first, but its change adds or changes no test file; add the failing test the task names`);
  }
}

function refuseMissingLiterals(task, root, planPath = null) {
  if (task.literals !== null || !task.data) return;
  const literals = dataLiterals(task.data);
  if (literals.length === 0) return;
  const found = literalFinder(root, planPath);
  const missing = [...new Set(literals)].filter((literal) => !found(literal));
  if (missing.length > 0) {
    throw new LandingError(`Task ${task.number}: Data: names ${missing.map((literal) => `\`${literal}\``).join(', ')}, found in neither its change nor the tree; fix the string, or add \`Literals: none (<reason>)\` to the task if it is prose`);
  }
}

function refuseUnplannedPaths(task, options) {
  const unplanned = unplannedPaths(task, options);
  if (unplanned.length > 0) {
    throw new OutsideFilesError(`Task ${task.number} changed a path outside Files: ${unplanned.map((file) => `\`${file}\``).join(', ')}`);
  }
}

// A long-format task's proof: each distinct `Run:` command some step expects
// to pass, never one only a test-first red step or a failure demo runs, nor an
// MCP call only the session can make.
function passingRunsOf(task) {
  return [...new Set(task.runs.filter((run) => run.expectsPass && mcpToolCall(run.command) === null).map((run) => run.command))];
}

function checkReport(task, reportText, reportPath) {
  const mcpCall = task.compact ? mcpProofOf(task) : null;
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, reportText, reportPath);
  const proofCommand = task.compact && pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}

/**
 * The unplanned-path and report checks landTask runs first, then Lint and the Land
 * gate as landTask runs them, a failure refusing closed: nothing runs the
 * Proof or commits, so a builder can run it before it reports and fix a
 * trivial gate failure itself.
 */
export function checkTask({ planText, number, root, reportText = null, reportPath = '--report', planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  refuseMismatchedToplevel(root);
  return locked(root, () => checkTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin }));
}

function checkTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin }) {
  const plan = parsePlan(planText);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  clearCheckStamp(root, number);
  refuseMcpProofUnderPin(pin, task);
  refuseUnplannedPaths(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: false }) });
  checkReport(task, reportText, reportPath);
  const frame = frameOf(plan.frame);
  const warnLines = runPreCommitGates(task, frame, root);
  const gateLine = warnLines + gateCheckedOnCandidate(plan, task, frame, { root, planId });
  const report = `Report OK: Task ${number}\n`;
  writeCheckStamp(root, number, report);
  return `${gateLine}${report}`;
}

function gateCheckedOnCandidate(plan, task, frame, { root, planId }) {
  if (frame.landGate === null || frame.landGate === 'none') return '';
  const candidate = commitCandidate(commitBlockOf(plan, task.number, planId, signatureChanges(task, root), root), root, task, planId);
  const gateLine = gateCandidate(frame, root, gateEnvOf(plan, task, root, planId), candidate);
  if (!dropCandidate(root, candidate)) throw new LandingError(`HEAD moved off the candidate ${candidate.candidate.slice(0, 7)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  return gateLine;
}

function checkStampPath(root, number) {
  return path.join(root, SCRATCH_FOLDER, `checked-${number}`);
}

function clearCheckStamp(root, number) {
  fs.rmSync(checkStampPath(root, number), { force: true });
}

function writeCheckStamp(root, number, report) {
  const stamp = checkStampPath(root, number);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, report);
}

function locked(root, action) {
  try {
    return withLandLock(root, action);
  } catch (error) {
    if (error instanceof LandLockError) throw new LandingError(error.message);
    throw error;
  }
}

export function checkCodeRules({ planText, number, root, planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  const task = parsePlan(planText).tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return `${runCodeRules(task.files.map((file) => file.path), root)}Code rules OK: Task ${number}\n`;
}

// Only next-task.mjs writes a task's brief, so a landing names no task to
// dispatch: it points at next-task.mjs, or says every task landed.
function nextLine(wave, planPath, root) {
  if (wave.length === 0) return waveLine(wave);
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'next-task.mjs');
  return `Then: node "${script}" --block --plan "${planPath}" --root "${root}"`;
}

function taskOf(plan, number) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return task;
}

function refuseBeforeProof(plan, task, { root, planPath, pin, planId }) {
  refuseMcpProofUnderPin(pin, task);
  refuseUnplannedPaths(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: true }) });
  refuseUntestedTestFirst(task, root);
  refuseMissingLiterals(task, root, planPath);
  const block = commitBlockOf(plan, task.number, planId, signatureChanges(task, root), root);
  refuseBadCommitText(task.commitSubject ?? task.title, block);
  return block;
}

function proveTask(task, { root, planPath, docker, reportText, reportPath }) {
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proofCommands = proofCommand === null ? passingRunsOf(task) : [proofCommand];
  const proofs = proofCommands.map((command) => runProof(task, command, { root, field: task.compact ? 'Proof' : 'Run', docker }));
  runNamedTests(task, proofCommands, { root, planPath });
  return { proofs, pending, redLine: redGreenLine(task, proofCommands, root, pending) };
}

function runPreCommitGates(task, frame, root) {
  const files = task.files.map((file) => file.path);
  runLint(frame.lint, files, root);
  return runCodeRules(files, root);
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function headMessage(root) {
  const head = spawnSync('git', ['-C', root, 'log', '-1', '--format=%B'], { encoding: 'utf8' });
  return head.status === 0 ? head.stdout : '';
}

function headSha(root) {
  const head = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return head.status === 0 ? head.stdout.trim() : null;
}

function moveHead(root, message, target, expected) {
  const moved = spawnSync('git', ['-C', root, 'update-ref', '-m', message, 'HEAD', target, expected], { encoding: 'utf8' });
  return moved.status === 0;
}

function dropCandidate(root, { base, candidate }) {
  return moveHead(root, 'land-task: drop candidate', base, candidate) || headSha(root) === base;
}

function clearStaleCandidate(root, planId) {
  if (!headMessage(root).split('\n').some((line) => line.startsWith(`Plan-candidate: ${planId}/`))) return;
  const candidate = headSha(root);
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' });
  if (base.status !== 0) return;
  dropCandidate(root, { base: base.stdout.trim(), candidate });
}

function commitCandidate(block, root, task, planId) {
  const trailer = candidateTrailer(planId, task.number);
  const base = headSha(root);
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  const candidate = headSha(root);
  if (!headMessage(root).split('\n').includes(trailer)) throw new LandingError(`the Commit: block of Task ${task.number} left no commit carrying "${trailer}"`);
  if (git(root, 'rev-parse', `${candidate}~1`) !== base) throw new LandingError(`the Commit: block of Task ${task.number} did not make exactly one commit on ${base.slice(0, 7)}`);
  return { base, candidate };
}

function authorEnvOf(root, candidate) {
  const [name, email, date] = git(root, 'log', '-1', '--format=%an%x00%ae%x00%aI', candidate).split('\0');
  return { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date };
}

function signsCommits(root) {
  const signing = spawnSync('git', ['-C', root, 'config', '--type=bool', '--get', 'commit.gpgsign'], { encoding: 'utf8' });
  return signing.stdout.trim() === 'true';
}

function promoteCandidate(root, task, planId, { base, candidate }) {
  const message = execFileSync('git', ['-C', root, 'log', '-1', '--format=%B', candidate], { encoding: 'utf8' })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = execFileSync('git', ['-C', root, 'commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { encoding: 'utf8', input: message, env: authorEnvOf(root, candidate) }).trim();
  if (!moveHead(root, 'land-task: promote candidate', promoted, candidate)) {
    throw new LandingError(`HEAD moved off the candidate ${candidate.slice(0, 7)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  }
}

function gateCandidate(frame, root, gateEnv, candidate) {
  try {
    return runLandGate(frame.landGate, root, gateEnv) ?? '';
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
}

function runCommitBlock(block, root, number) {
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status === 0) return;
  const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
  throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
}

function refuseOutsideTaskFiles(task, { root, planPath, base }) {
  const entries = task.files.map((file) => file.path);
  const exempt = [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  const outside = git(root, 'diff', '--name-only', base, 'HEAD').split('\n')
    .filter((changed) => changed !== '' && !changed.startsWith(`${SCRATCH_FOLDER}/`) && !exempt.includes(changed) && !worktrees.has(path.join(top, changed)))
    .filter((changed) => !isCovered(entries, changed) && !coversCompanion(entries, changed));
  if (outside.length > 0) throw new OutsideFilesError(`the commit of Task ${task.number} holds a path outside Files: ${outside.map((file) => `\`${file}\``).join(', ')}`);
}

function committedSha(task, { root, planId, planPath, base }) {
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, task.number);
  if (!body.includes(trailer)) throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  if (git(root, 'rev-parse', 'HEAD~1') !== base) throw new LandingError(`HEAD ${sha} does not sit directly on ${base.slice(0, 7)}, the commit Task ${task.number} started from`);
  refuseOutsideTaskFiles(task, { root, planPath, base });
  return sha;
}

function landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine }) {
  const proofLines = proofs.map(({ command, tail }) => `Proof: ${[`${command}: pass (exit 0)`, ...tail].join('\n')}\n`).join('');
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  const route = planRoute(plan.tasks);
  const wave = nextWave(plan.tasks, landed, route.route === 'inline' || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  return `Committed: ${sha} Task ${number}\n${proofLines}${gateLine}${pendingLine}Landed: ${landed.join(', ')}\n${routeLine(route)}\n${nextLine(wave, planPath, root)}\n`;
}

export function landTask({ planText, number, root, reportText = null, reportPath = '--report', planPath, pin = null, docker = dockerHost }) {
  refuseOutsidePin(pin, planPath, number);
  refuseMismatchedToplevel(root);
  return locked(root, () => landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }));
}

function landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  const task = taskOf(plan, number);
  const block = refuseBeforeProof(plan, task, { root, planPath, pin, planId });
  const { proofs, pending, redLine } = proveTask(task, { root, planPath, docker, reportText, reportPath });
  const frame = frameOf(plan.frame);
  const warnLines = runPreCommitGates(task, frame, root);
  const changed = taskChangedPaths(root);
  const candidate = commitCandidate(block, root, task, planId);
  const gateLine = warnLines + gateCandidate(frame, root, gateEnvOf(plan, task, root, planId), candidate);
  try {
    runCoveringTests(task, proofs.map(({ command }) => command), root, changed);
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
  promoteCandidate(root, task, planId, candidate);
  const sha = committedSha(task, { root, planId, planPath, base: candidate.base });
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  writeProofRecord({ root, planId, number, proofs, redLine });
  return landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine });
}

// `--next` swaps the `Then:` line for next-task's own report, slots opened, so the caller dispatches in the same turn.
export function withNext(output, { planPath, planText, root }) {
  const kept = output.split('\n').filter((line) => !line.startsWith('Then: ')).join('\n');
  return `${kept}${nextTaskReport({ planPath, planText, root, open: true })}`;
}

const USAGE = [
  'usage: land-task.mjs --plan <plan> --task <n> [--root <dir>] [--report <file>] [--check] [--code-rules] [--next]',
  '       land-task.mjs --fix <subject> [--plan <plan>] [--root <dir>]',
  "Lands a plan task from its implementer report, or with --check validates the report without committing; --code-rules runs only the code-rule check, --next appends the next-task report, --fix commits a repair with no Plan-task trailer. Exits 2 on a usage error."
].join('\n');

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', check: 'boolean', 'code-rules': 'boolean', next: 'boolean' }, { usage: USAGE });
  const root = flags.root ?? process.cwd();
  const pin = parsePin(process.env.EXO_RUN_TASK);
  const codeRulesOnly = flags['code-rules'] === true;
  if (pin !== null && !codeRulesOnly && flags.check !== true) quiet.file = proofRecordPath(root, pin.planId, pin.number);
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, plan: flags.plan ?? null, pin }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (codeRulesOnly) {
    process.stdout.write(checkCodeRules({ planText, number: Number(flags.task), root, planPath: flags.plan, pin }));
    return;
  }
  // The implementer prompt's `Report to:` path, so a wave's per-task worktree
  // finds its own report with no extra flag.
  const reportPath = flags.report ?? path.join(root, '.exo', `implementer-${flags.task}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  const run = flags.check === true ? checkTask : landTask;
  let output = run({ planText, number: Number(flags.task), root, reportText, reportPath, planPath: flags.plan, pin });
  if (flags.next === true && run === landTask) output = withNext(output, { planPath: flags.plan, planText, root });
  process.stdout.write(quiet.file === null ? output : quietText(output, true));
  if (run === landTask) refreshProgress({ planPath: flags.plan, planText, root });
}

function refusal(error) {
  if (error instanceof UsageError) return { text: `land-task: ${error.message}\n`, code: 2, usage: true };
  if (error instanceof CodeRuleError || error instanceof EnvError) return { text: `land-task: ${error.message}\n${refusalHandler(error.kind)}\n`, code: 1 };
  if (error instanceof PlanDriftError) return { text: `${error.message}\n${refusalHandler(error.kind)}\nexo-retry\n`, code: 1 };
  if (error instanceof LandingError) return { text: `land-task: ${error.message}\n${refusalHandler(error.kind)}\nexo-retry\n`, code: 1 };
  if (error instanceof PlanError) return { text: `land-task: ${error.message}\n`, code: 1 };
  throw error;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const { text, code, usage } = refusal(error);
    process.stderr.write(usage || quiet.file === null ? text : quietText(text, false));
    process.exitCode = code;
  }
}
