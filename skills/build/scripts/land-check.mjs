import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { shortSha, gitText, gitLine } from '#git';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { planIdOf, landedTasks, decisionsPathOf, planTaskTrailer, defaultBase, taskCommits } from '#plan-landed';
import { SCRATCH_FOLDER } from '#scratch-path';
import { LandingError, PinError, AlreadyLandedError, UnfinishedMergeError } from './land-errors.mjs';
import { reportSourceOf } from './land-stopped.mjs';
import { locked, headMessage, headSha, moveHead } from './land-git.mjs';
import { commitBlockOf, dropsOf, candidateTrailer } from './land-commit-block.mjs';
import { refuseOtherPlan, refuseMcpProofUnderPin, refuseMismatchedToplevel } from './land-pin.mjs';
import { siblingWorkOf, landablePaths, changedPaths, isProtectedPath, nestedWorktrees, leftForSiblingWarning, statedLimitWarning } from './land-paths.mjs';
import { signatureChanges } from './land-signatures.mjs';
import { runCodeRules, runLint } from './land-code-rules.mjs';
import { runCoveringTests, runProof, runNamedTests } from './land-proof.mjs';
import { writeBehaviour } from '../../spec/scripts/behaviour.mjs';
import { UsageError, environmentMs } from '#script-flags';
import { execFileSync, spawnSync } from 'node:child_process';
import { evidenceProblem } from '#evidence-rules';
import { attributionProblem, subjectProblem } from '#commit-text';
import { runCheck } from '../../../lib/run-check.mjs';
import { gateRefusal, lastPassMs, SLOW_GATE_MS, treePassMs } from '#check-cache';
import { PROOF_TIMEOUT_MS, PROOF_TAIL_LINES, mcpProofOf, deferredProofOf, proofCommandOf } from './land-report.mjs';
import { createWorktree, worktreePath } from '#checkout';
import { discard, runSetup, slotEnvOf } from './open-slots.mjs';
import { dataLiterals, literalFinder } from '#data-literals';
import { mcpToolCall } from '#mcp-tool-call';
import { isTestFirst, runInWorktree, testPaths } from '#red-green';
import { unfinishedMergeNote } from '#merge-state';
import { landRefusal } from '../../../lib/refusal-handlers.mjs';

export function checkTask({ planText, number, root, reportText, reportPath, planPath, pin }) {
  refuseOtherPlan(pin, planPath, number);
  refuseMismatchedToplevel(root);
  return locked(root, () => checkTaskLocked({ planText, number, root, ...reportSourceOf({ root, number, reportText, reportPath }), planPath, pin }));
}

function checkTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin }) {
  const plan = parsePlan(planText);
  const task = taskOf(plan, number);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  fs.rmSync(checkStampPath(root, number), { force: true });
  refuseMcpProofUnderPin(pin, task);
  const warning = refuseTogether(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: false }), reportText, reportPath });
  const frame = frameOf(plan.frame);
  const warnLines = runPreCommitGates(task, frame, root);
  const gateLine = warnLines + gateCheckedOnCandidate({ plan, task, frame, root, planId });
  const report = `Report OK: Task ${number}\n`;
  writeCheckStamp(root, number, report);
  return `${warning}${gateLine}${report}`;
}

function gateCheckedOnCandidate({ plan, task, frame, root, planId }) {
  if (frame.landGate === null || frame.landGate === 'none') return '';
  stageOutside(root, refreshedBehaviour(root));
  const candidate = commitCandidate({ block: commitBlockOf({ plan, number: task.number, planId, signatures: signatureChanges(task, root), root }), root, task, planId });
  const gateLine = gateCandidate({ frame, root, gateEnv: gateEnvOf({ plan, task, root, planId }), candidate });
  if (!dropCandidate(root, candidate)) throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate.candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  return gateLine;
}

function checkStampPath(root, number) {
  return path.join(root, SCRATCH_FOLDER, `checked-${number}`);
}

function writeCheckStamp(root, number, report) {
  const stamp = checkStampPath(root, number);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, report);
}

export function checkCodeRules({ planText, number, root, planPath, pin }) {
  refuseOtherPlan(pin, planPath, number);
  const task = taskOf(parsePlan(planText), number);
  return `${runCodeRules(task.files.map((file) => file.path), root)}Code rules OK: Task ${number}\n`;
}

function refreshedBehaviour(root) {
  return fs.existsSync(path.join(root, 'docs/behaviour')) ? writeBehaviour(root).written : [];
}

export function stageCandidate({ plan, task, frame, block, outside, root, planId, reportText }) {
  const warnLines = runPreCommitGates(task, frame, root);
  const changed = taskChangedPaths(root);
  stageOutside(root, [...outside, ...refreshedBehaviour(root)]);
  const candidate = commitCandidate({ block, root, task, planId, reportText });
  const gateLine = warnLines + gateCandidate({ frame, root, gateEnv: gateEnvOf({ plan, task, root, planId }), candidate });
  return { changed, candidate, gateLine };
}

export function coverOrDrop({ task, proofs, root, changed, pendingEvidence, candidate }) {
  try {
    runCoveringTests(task, proofs.map(({ command }) => command), { root, changed, pendingEvidence });
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
}

export function promoteAndCommit({ task, root, planId, planPath, candidate }) {
  promoteCandidate({ root, task, planId, candidate });
  return committedSha(task, { root, planId, planPath, base: candidate.base });
}

export function taskOf(plan, number) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return task;
}

export function refuseBeforeProof(plan, task, { root, planPath, pin, planId, reportText, reportPath }) {
  refuseMcpProofUnderPin(pin, task);
  const siblingWork = siblingWorkOf(plan, task, { root, planPath, landing: true });
  const warning = refuseTogether(task, { root, planPath, siblingWork, reportText, reportPath });
  const outside = landablePaths({ root, planPath, siblingWork });
  const block = commitBlockOf({ plan, number: task.number, planId, signatures: signatureChanges(task, root), root });
  refuseBadCommitText(task.commitSubject ?? task.title, block);
  if (task.evidence != null) refuseBadEvidence(`Evidence: ${task.evidence}`);
  return { block, warning, outside };
}

export function proveTask(task, { root, planPath, docker, reportText, reportPath, pendingEvidence }) {
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proofCommands = proofCommand === null ? passingRunsOf(task) : [proofCommand];
  const proofs = proofCommands.map((command) => runProof(task, command, { root, field: task.compact ? 'Proof' : 'Run', docker, pendingEvidence }));
  runNamedTests(task, proofCommands, { root, planPath, pendingEvidence });
  const { line, warning } = redGreenLine(task, { proofCommands, root, pending });
  return { proofs, pending, redLine: line, warning };
}

function runPreCommitGates(task, frame, root) {
  const files = task.files.map((file) => file.path);
  runLint(frame.lint, files, root);
  return runCodeRules(files, root);
}

function refuseBadCommitText(subject, rest) {
  const problem = subjectProblem(subject) ?? attributionProblem(`${subject}\n${rest}`);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

function refuseBadEvidence(text) {
  const problem = evidenceProblem(text);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

export function fixLand({ root, subject, body = null, plan = null, pin }) {
  if (pin !== null) throw new PinError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; --fix is refused`);
  refuseMismatchedToplevel(root);
  refuseUnfinishedMerge(root);
  refuseBadCommitText(subject, body ?? '');
  refuseBadEvidence(body ?? '');
  return locked(root, () => fixLandLocked({ root, subject, body, plan }));
}

function fixLandLocked({ root, subject, body, plan }) {
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit; edit a file before running --fix');
  }
  if (plan !== null) runLint(frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).lint, changedPaths(root), root);
  execFileSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
  const messages = body === null ? ['-m', subject] : ['-m', subject, '-m', body];
  execFileSync('git', ['-C', root, 'commit', ...messages], { encoding: 'utf8' });
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return `Committed: ${sha}\n`;
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

export function unlandedEvidenceOf({ plan, root, planId, skip = null }) {
  const landed = landedTasks(plan.tasks, root, planId);
  const values = plan.tasks
    .filter((other) => other.number !== skip?.number && !landed.includes(other.number) && other.evidence !== null)
    .map((other) => other.evidence);
  return values.length === 0 ? undefined : values.join('\n');
}

function gateEnvOf({ plan, task, root, planId }) {
  return { EXO_DROPS: dropsOf(task) ?? undefined, EXO_PENDING_EVIDENCE: unlandedEvidenceOf({ plan, root, planId, skip: task }) };
}

export function runLandGate(landGate, root, gateEnv = {}) {
  if (landGate === null || landGate === 'none') return null;
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= SLOW_GATE_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so gate runs it once.\n`;
  }
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const restore = setGateEnv(gateEnv);
  let gate;
  try {
    gate = runCheck(root, landGate, { timeoutMs: deadlineMs });
  } finally {
    restore();
  }
  if (gate.cached) return `Land gate "${landGate}" skipped: its log shows a clean pass on this tree.\n`;
  if (gate.timedOut) throw new LandingError(`Land gate "${landGate}" failed:\n${`${gate.output}timed out after ${deadlineMs / 1000}s`.trim()}`);
  if (gate.code !== 0) throw new LandingError(`Land gate "${landGate}" failed:\n${gate.output.trim()}`);
  if (!gate.ok) throw new LandingError(`Land gate "${landGate}" exited 0 but ${gateRefusal(landGate, gate.output)}:\n${gate.output.trim()}`);
  return '';
}

const RAISE_PREFIX = /^Budget-raise:[ \t]/;

function raiseLinesOf(reportText) {
  if (reportText === null) return [];
  return [...new Set(reportText.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter((line) => RAISE_PREFIX.test(line)))];
}

function carryRaises(root, reportText) {
  const message = headMessage(root);
  const present = new Set(message.split('\n'));
  const missing = raiseLinesOf(reportText).filter((line) => !present.has(line));
  if (missing.length === 0) return;
  const amended = spawnSync('git', ['-C', root, 'commit', '--amend', '-q', '--no-verify', '-F', '-'], { encoding: 'utf8', input: `${message.trimEnd()}\n${missing.join('\n')}\n` });
  if (amended.status !== 0) throw new LandingError(`carrying the Budget-raise lines onto the task commit failed:\n${amended.stderr}`);
}

function dropCandidate(root, { base, candidate }) {
  return moveHead(root, 'land-task: drop candidate', { target: base, expected: candidate }) || headSha(root) === base;
}

export function clearStaleCandidate(root, planId) {
  if (!headMessage(root).split('\n').some((line) => line.startsWith(`Plan-candidate: ${planId}/`))) return;
  const candidate = headSha(root);
  const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' });
  if (base.status !== 0) return;
  dropCandidate(root, { base: base.stdout.trim(), candidate });
}

function commitCandidate({ block, root, task, planId, reportText = null }) {
  const trailer = candidateTrailer(planId, task.number);
  const base = headSha(root);
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  carryRaises(root, reportText);
  const candidate = headSha(root);
  if (!headMessage(root).split('\n').includes(trailer)) throw new LandingError(`the Commit: block of Task ${task.number} left no commit carrying "${trailer}"`);
  if (gitText(root, ['rev-parse', `${candidate}~1`]) !== base) throw new LandingError(`the Commit: block of Task ${task.number} did not make exactly one commit on ${shortSha(base)}`);
  return { base, candidate };
}

function authorEnvOf(root, candidate) {
  const [name, email, date] = gitText(root, ['log', '-1', '--format=%an%x00%ae%x00%aI', candidate]).split('\0');
  return { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date };
}

function signsCommits(root) {
  const signing = spawnSync('git', ['-C', root, 'config', '--type=bool', '--get', 'commit.gpgsign'], { encoding: 'utf8' });
  return signing.stdout.trim() === 'true';
}

function promoteCandidate({ root, task, planId, candidate: { base, candidate } }) {
  const message = execFileSync('git', ['-C', root, 'log', '-1', '--format=%B', candidate], { encoding: 'utf8' })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = execFileSync('git', ['-C', root, 'commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { encoding: 'utf8', input: message, env: authorEnvOf(root, candidate) }).trim();
  if (!moveHead(root, 'land-task: promote candidate', { target: promoted, expected: candidate })) {
    throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  }
}

function slotDiffersFromCandidate(root) {
  const status = gitText(root, ['status', '--porcelain', '--untracked-files=all'], { trim: false });
  return status.split('\n').some((line) => line !== '' && !line.slice(3).startsWith(`${SCRATCH_FOLDER}/`));
}

function gateOnDetachedCandidate({ frame, root, gateEnv, candidate }) {
  const where = worktreePath(`gate-${candidate.candidate.slice(0, 12)}`, root);
  const made = createWorktree(root, where, ['--detach', where, candidate.candidate]);
  if (!made.ok) throw new LandingError(made.failure);
  try {
    const failed = runSetup(where, frame.worktreeSetup, slotEnvOf(root));
    if (failed !== null) throw new LandingError(failed.reason);
    return runLandGate(frame.landGate, where, gateEnv) ?? '';
  } finally {
    discard(root, [where]);
  }
}

function gateCandidate({ frame, root, gateEnv, candidate }) {
  try {
    if (slotDiffersFromCandidate(root)) return gateOnDetachedCandidate({ frame, root, gateEnv, candidate });
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

function stageOutside(root, paths) {
  if (paths.length > 0) execFileSync('git', ['-C', root, 'update-index', '--add', '--remove', '--', ...paths]);
}

function committedProtectedPaths({ root, planPath, base }) {
  const exempt = [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  const worktrees = nestedWorktrees(root);
  const top = realpathSync(root);
  return gitText(root, ['diff', '--name-only', base, 'HEAD']).split('\n')
    .filter((changed) => changed !== '' && !changed.startsWith(`${SCRATCH_FOLDER}/`) && !exempt.includes(changed) && !worktrees.has(path.join(top, changed)))
    .filter(isProtectedPath);
}

function warnProtectedPaths(task, options) {
  const protectedPaths = committedProtectedPaths(options);
  if (protectedPaths.length === 0) return;
  process.stderr.write(`[WARN] Task ${task.number} committed a security-boundary path: ${protectedPaths.map((file) => `\`${file}\``).join(', ')}\n`);
}

function committedSha(task, { root, planId, planPath, base }) {
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, task.number);
  if (!body.includes(trailer)) throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  if (gitText(root, ['rev-parse', 'HEAD~1']) !== base) throw new LandingError(`HEAD ${sha} does not sit directly on ${shortSha(base)}, the commit Task ${task.number} started from`);
  warnProtectedPaths(task, { root, planPath, base });
  return sha;
}

export function taskChangedPaths(root) {
  const entries = execFileSync('git', ['-C', root, 'status', '--porcelain', '-z', '-uall'], { encoding: 'utf8' }).split('\0').filter((entry) => entry !== '');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    paths.push(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) paths.push(entries[++i]);
  }
  return paths;
}

const BOUNDARY_WORDS = ['only', 'not', 'no', 'never', 'every', 'each', 'all', 'full', 'except', 'unless'];

function countWords(text) {
  const counts = Object.fromEntries(BOUNDARY_WORDS.map((word) => [word, 0]));
  for (const match of text.toLowerCase().matchAll(/[a-z]+/g)) {
    if (match[0] in counts) counts[match[0]] += 1;
  }
  return counts;
}

function parseDrops(value) {
  return value.split(',').map((entry) => entry.trim().replace(/\s+/g, ' ')).filter((entry) => / in /.test(entry));
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

function redGreenLine(task, { proofCommands, root, pending }) {
  if (task.red !== null) return { line: `Red: skipped: none (${task.red.reason})`, warning: '' };
  if (pending !== null) return { line: 'Red: skipped: deferred MCP proof', warning: '' };
  if (proofCommands.length === 0) return { line: 'Red: skipped: no passing Bash proof command', warning: '' };
  const overlay = testPaths(taskChangedPaths(root));
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  let sha = '';
  for (const command of proofCommands) {
    const base = runInWorktree({ root, base: 'HEAD', command, overlay, timeoutMs, headMs: treePassMs(root, command) ?? undefined });
    sha = shortSha(base.sha);
    if (base.status === 'error') {
      throw new LandingError(`Task ${task.number}: the red-green check of "${command}" on ${sha || 'HEAD'} failed to finish:\n${base.output.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n')}`);
    }
    if (base.status === 'red') return { line: 'Red: proved', warning: '' };
  }
  const warning = `[WARN] Task ${task.number}: Proof passes on ${sha} without the production change: no red proof; tighten the test or add \`Red: none (<reason>)\` to the task${untaggedBaseNote(task, root)}\n`;
  return { line: 'Red: skipped: Proof passed without the production change', warning };
}

function refuseUntestedTestFirst(task, root) {
  if (isTestFirst(task) && testPaths(taskChangedPaths(root)).length === 0) {
    throw new LandingError(`Task ${task.number} is test-first, but its change adds or changes no test file; add the failing test the task names`);
  }
}

export function refuseAlreadyLanded(plan, task, { root, planId }) {
  if (!landedTasks(plan.tasks, root, planId).includes(task.number)) return;
  const [sha] = taskCommits(task, root, planId);
  throw new AlreadyLandedError(`Task ${task.number} is already landed as ${shortSha(sha)}; landing it again would add no change`);
}

function refuseMissingLiterals(task, root, planPath) {
  if (task.literals !== null || !task.data) return;
  const literals = dataLiterals(task.data);
  if (literals.length === 0) return;
  const found = literalFinder(root, planPath);
  const missing = [...new Set(literals)].filter((literal) => !found(literal));
  if (missing.length > 0) {
    throw new LandingError(`Task ${task.number}: Data: names ${missing.map((literal) => `\`${literal}\``).join(', ')}, found in neither its change nor the tree; fix the string, or add \`Literals: none (<reason>)\` to the task if it is prose`);
  }
}

export function refuseUnfinishedMerge(root) {
  const note = unfinishedMergeNote(root);
  if (note !== null) throw new UnfinishedMergeError(note);
}

const PROSE_FOLDERS = ['skills/', 'agents/', 'rules/', 'hooks/'];

function headText(file, root) {
  return gitLine(root, ['show', `HEAD:${file}`], { trim: false, maxBuffer: 1024 * 1024 });
}

function droppedWords(file, root, permitted) {
  const head = headText(file, root);
  if (head === null) return [];
  const before = countWords(head);
  const after = countWords(fs.readFileSync(path.join(root, file), 'utf8'));
  return Object.keys(before).filter((word) => after[word] < before[word] && !permitted.has(`${word} in ${file}`));
}

function isTrackedProse(file, root) {
  if (!file.endsWith('.md') || !PROSE_FOLDERS.some((folder) => file.startsWith(folder))) return false;
  return fs.existsSync(path.join(root, file)) && execFileSync('git', ['-C', root, 'ls-files', file], { encoding: 'utf8' }) !== '';
}

function droppedBoundaryWarning(task, root) {
  const permitted = new Set();
  parseDrops(dropsOf(task) ?? '').forEach((entry) => {
    const [words, file] = entry.split(/ in (\S+)$/);
    words.split(' ').forEach((word) => permitted.add(`${word} in ${file}`));
  });
  const lines = taskChangedPaths(root)
    .filter((file) => isTrackedProse(file, root))
    .map((file) => ({ file, words: droppedWords(file, root, permitted) }))
    .filter((entry) => entry.words.length > 0)
    .map((entry) => `[WARN] Task ${task.number} dropped boundary words: ${entry.words.join(', ')} in \`${entry.file}\`\n`);
  return lines.join('');
}

function passingRunsOf(task) {
  return [...new Set(task.runs.filter((run) => run.expectsPass && mcpToolCall(run.command) === null).map((run) => run.command))];
}

function checkReport(task, reportText, reportPath) {
  const mcpCall = task.compact ? mcpProofOf(task) : null;
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, { reportText, reportPath });
  const proofCommand = task.compact && pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}

function attempt(id, run) {
  const check = { id, error: null, violation() {
    try {
      run();
      return null;
    } catch (error) {
      if (!(error instanceof LandingError)) throw error;
      check.error = error;
      return error.message;
    }
  } };
  return check;
}

function refuseTogether(task, { root, planPath, siblingWork, reportText, reportPath }) {
  const checks = [
    attempt('untested test-first', () => refuseUntestedTestFirst(task, root)),
    attempt('missing literals', () => refuseMissingLiterals(task, root, planPath)),
    attempt('report', () => checkReport(task, reportText, reportPath))
  ];
  const text = landRefusal(path.join(root, SCRATCH_FOLDER, 'refusals'), task.number, checks);
  if (text === null) return leftForSiblingWarning(task, { root, planPath, siblingWork }) + droppedBoundaryWarning(task, root) + statedLimitWarning(task, reportText);
  const first = checks.find((check) => check.error !== null).error;
  throw new first.constructor(text.trimEnd());
}
