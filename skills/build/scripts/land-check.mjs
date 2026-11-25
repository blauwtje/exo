import fs, { realpathSync } from 'node:fs';
import path from 'node:path';
import { git, gitLine, shortSha, gitText } from '#git';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { planIdOf, landedTasks, planTaskTrailer, taskCommits } from '#plan-landed';
import { LEGACY_EXO_FOLDER, scratchPath } from '#scratch-path';
import { LandingError, RefusedError, AlreadyLandedError, UnfinishedMergeError } from './land-errors.mjs';
import { reportSourceOf } from './land-stopped.mjs';
import { locked, headMessage, headSha, moveHead } from './land-git.mjs';
import { commitBlockOf, candidatePrefix, candidateTrailer } from './land-commit-block.mjs';
import { changedPaths } from './land-paths.mjs';
import { runCoveringTests, runProof, runNamedTests } from './land-proof.mjs';
import { UsageError, environmentMs } from '#script-flags';
import { spawnSync } from 'node:child_process';
import { runCheck } from '#run-check';
import { gateRefusal, lastPassMs, GATE_ONCE_PER_RUN_FROM_MS, treePassMs } from '#check-cache';
import { PROOF_TIMEOUT_MS, PROOF_TAIL_LINES, mcpProofOf, deferredProofOf, proofCommandOf } from './land-report.mjs';
import { createWorktree, worktreePath } from '#checkout';
import { runInWorktree, testPaths } from '#red-green';

export function checkTask({ planText, number, root, reportText, reportPath, planPath }) {
  refuseMismatchedToplevel(root);
  return locked(root, () => checkTaskLocked({ planText, number, root, ...reportSourceOf({ root, number, reportText, reportPath }), planPath }));
}

function checkTaskLocked({ planText, number, root, reportText, reportPath, planPath }) {
  const plan = parsePlan(planText);
  const task = taskOf(plan, number);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  checkReport(task, reportText, reportPath);
  const frame = frameOf(plan.frame);
  const gateLine = gateCheckedOnCandidate({ task, frame, root, planId });
  return `${gateLine}Report OK: Task ${number}\n`;
}

function gateCheckedOnCandidate({ task, frame, root, planId }) {
  if (frame.landGate === null || frame.landGate === 'none') return '';
  const candidate = commitCandidate({ block: commitBlockOf({ task, planId, root }), root, task, planId });
  const gateLine = gateCandidate({ frame, root, candidate });
  if (!dropCandidate(root, candidate)) throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate.candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  return gateLine;
}

export function stageCandidate({ task, frame, block, outside, root, planId }) {
  const changed = taskChangedPaths(root);
  stageOutside(root, outside);
  const candidate = commitCandidate({ block, root, task, planId });
  const gateLine = gateCandidate({ frame, root, candidate });
  return { changed, candidate, gateLine, removedBlock: removedTestLinesBlock(root, candidate, testPaths(changed)) };
}

function removedTestLinesBlock(root, { base, candidate }, paths) {
  if (paths.length === 0) return '';
  const diff = gitText(root, ['diff', '--diff-filter=M', '--no-renames', '-U0', base, candidate, '--', ...paths], { trim: false });
  const removed = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) file = line.slice(4).replace(/^a\//, '');
    else if (line.startsWith('-') && line.slice(1).trim() !== '') removed.push(`- ${file}: ${line.slice(1).trim()}`);
  }
  return removed.length === 0 ? '' : `Removed test lines: ${removed.length}\n${removed.join('\n')}\n`;
}

export function coverOrDrop({ task, proofs, root, changed, candidate }) {
  try {
    runCoveringTests(task, proofs.map(({ command }) => command), { root, changed });
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

export function refuseBeforeProof(task, { root, planPath, planId, reportText, reportPath }) {
  checkReport(task, reportText, reportPath);
  const outside = changedPaths(root, planPath);
  refuseSecrets(task, root);
  const unlistedLine = unlistedLineOf(task, outside);
  const block = commitBlockOf({ task, planId, root, unlistedLine });
  refuseBadCommitText(task.title, root);
  return { block, outside, unlistedLine };
}

function unlistedLineOf(task, changed) {
  const unlisted = changed.filter((file) => !task.files.some(({ path: listed }) => file === listed || (listed.endsWith('/') && file.startsWith(listed))));
  return unlisted.length === 0 ? '' : `Outside Files: ${unlisted.join(', ')}\n`;
}

const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/]
];

function addedLinesOf(root) {
  const added = [];
  let file = null;
  let inHeader = false;
  const diff = gitText(root, ['diff', 'HEAD', '-U0', '--no-color'], { trim: false });
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inHeader = true;
    else if (line.startsWith('@@')) inHeader = false;
    else if (inHeader && line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (inHeader) continue;
    else if (line.startsWith('+')) added.push({ file, text: line.slice(1) });
  }
  const untracked = gitText(root, ['ls-files', '--others', '--exclude-standard', '-z'], { trim: false }).split('\0').filter((name) => name !== '' && !name.startsWith(`${LEGACY_EXO_FOLDER}/`));
  for (const name of untracked) {
    const full = path.join(root, name);
    if (!fs.lstatSync(full).isFile()) continue;
    for (const text of fs.readFileSync(full, 'utf8').split('\n')) added.push({ file: name, text });
  }
  return added;
}

function refuseSecrets(task, root) {
  for (const { file, text } of addedLinesOf(root)) {
    const [name] = SECRET_PATTERNS.find(([, pattern]) => pattern.test(text)) ?? [];
    if (name !== undefined) throw new LandingError(`Task ${task.number} adds ${file} matching the pattern "${name}"; remove it and use an environment variable or a secret store`);
  }
}

export function proveTask(task, { root, planPath, reportText, reportPath }) {
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proofCommands = proofCommand === null ? [] : [proofCommand];
  const proofs = proofCommands.map((command) => runProof(task, command, { root }));
  runNamedTests(task, proofCommands, { root, planPath });
  const { line } = redGreenLine(task, { proofCommands, root, pending });
  return { proofs, pending, redLine: line };
}

function refuseBadCommitText(subject, root) {
  const problem = subjectProblem(subject, root);
  if (problem !== null) throw new LandingError(`commit text refused: ${problem}`);
}

export function fixLand({ root, subject, body = null }) {
  refuseMismatchedToplevel(root);
  refuseUnfinishedMerge(root);
  refuseBadCommitText(subject, root);
  return locked(root, () => fixLandLocked({ root, subject, body }));
}

function fixLandLocked({ root, subject, body }) {
  const status = gitText(root, ['status', '--porcelain']);
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit; edit a file before running --fix');
  }
  gitText(root, ['add', '-A']);
  const messages = body === null ? ['-m', subject] : ['-m', subject, '-m', body];
  gitText(root, ['commit', ...messages]);
  const sha = gitText(root, ['rev-parse', '--short', 'HEAD']);
  return `Committed: ${sha}\n`;
}

export function runLandGate(landGate, root) {
  if (landGate === null || landGate === 'none') return null;
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= GATE_ONCE_PER_RUN_FROM_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so gate runs it once.\n`;
  }
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const gate = runCheck(root, landGate, { timeoutMs: deadlineMs });
  if (gate.cached) return `Land gate "${landGate}" skipped: its log shows a clean pass on this tree.\n`;
  if (gate.timedOut) throw new LandingError(`Land gate "${landGate}" failed:\n${`${gate.output}timed out after ${deadlineMs / 1000}s`.trim()}`);
  if (gate.code !== 0) throw new LandingError(`Land gate "${landGate}" failed:\n${gate.output.trim()}`);
  if (!gate.ok) throw new LandingError(`Land gate "${landGate}" exited 0 but ${gateRefusal(landGate, gate.output)}:\n${gate.output.trim()}`);
  return '';
}

function dropCandidate(root, { base, candidate }) {
  return moveHead(root, 'land-task: drop candidate', { target: base, expected: candidate }) || headSha(root) === base;
}

export function clearStaleCandidate(root, planId) {
  if (!headMessage(root).split('\n').some((line) => line.startsWith(candidatePrefix(planId)))) return;
  const candidate = headSha(root);
  const base = git(root, ['rev-parse', 'HEAD~1']);
  if (base.status !== 0) return;
  dropCandidate(root, { base: base.stdout.trim(), candidate });
}

function commitCandidate({ block, root, task, planId }) {
  const trailer = candidateTrailer(planId, task.number);
  const base = headSha(root);
  runCommitBlock(block.replace(planTaskTrailer(planId, task.number), trailer), root, task.number);
  const candidate = headSha(root);
  if (!headMessage(root).split('\n').includes(trailer)) throw new LandingError(`the commit of Task ${task.number} left no commit carrying "${trailer}"`);
  if (gitText(root, ['rev-parse', `${candidate}~1`]) !== base) throw new LandingError(`the commit of Task ${task.number} did not make exactly one commit on ${shortSha(base)}`);
  return { base, candidate };
}

function authorEnvOf(root, candidate) {
  const [name, email, date] = gitText(root, ['log', '-1', '--format=%an%x00%ae%x00%aI', candidate]).split('\0');
  return { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date };
}

function signsCommits(root) {
  const signing = git(root, ['config', '--type=bool', '--get', 'commit.gpgsign']);
  return signing.stdout.trim() === 'true';
}

function promoteCandidate({ root, task, planId, candidate: { base, candidate } }) {
  const message = gitText(root, ['log', '-1', '--format=%B', candidate], { trim: false })
    .replace(candidateTrailer(planId, task.number), planTaskTrailer(planId, task.number));
  const signing = signsCommits(root) ? ['-S'] : [];
  const promoted = gitText(root, ['commit-tree', `${candidate}^{tree}`, '-p', base, ...signing, '-F', '-'], { input: message, stdio: 'pipe', env: authorEnvOf(root, candidate) });
  if (!moveHead(root, 'land-task: promote candidate', { target: promoted, expected: candidate })) {
    throw new LandingError(`HEAD moved off the candidate ${shortSha(candidate)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  }
}

function slotDiffersFromCandidate(root) {
  const status = gitText(root, ['status', '--porcelain', '--untracked-files=all'], { trim: false });
  return status.split('\n').some((line) => line !== '' && !line.slice(3).startsWith(`${LEGACY_EXO_FOLDER}/`));
}

function gateOnDetachedCandidate({ frame, root, candidate }) {
  const where = worktreePath(`gate-${candidate.candidate.slice(0, 12)}`, root);
  const made = createWorktree(root, where, ['--detach', where, candidate.candidate]);
  if (!made.ok) throw new LandingError(made.failure);
  try {
    const failed = runSetup(where, frame.worktreeSetup, slotEnvOf(root));
    if (failed !== null) throw new LandingError(failed.reason);
    return runLandGate(frame.landGate, where) ?? '';
  } finally {
    discard(root, [where]);
  }
}

function gateCandidate({ frame, root, candidate }) {
  try {
    if (slotDiffersFromCandidate(root)) return gateOnDetachedCandidate({ frame, root, candidate });
    return runLandGate(frame.landGate, root) ?? '';
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
}

function runCommitBlock(block, root, number) {
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status === 0) return;
  const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
  throw new LandingError(`the commit of Task ${number} failed:\n${output}`);
}

function stageOutside(root, paths) {
  if (paths.length > 0) gitText(root, ['update-index', '--add', '--remove', '--', ...paths]);
}

function committedSha(task, { root, planId, planPath, base }) {
  const head = gitText(root, ['log', '-1', '--format=%h%n%s%n%B'], { trim: false });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, task.number);
  if (!body.includes(trailer)) throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  if (subject !== task.title) throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${task.title}"`);
  if (gitText(root, ['rev-parse', 'HEAD~1']) !== base) throw new LandingError(`HEAD ${sha} does not sit directly on ${shortSha(base)}, the commit Task ${task.number} started from`);
  return sha;
}

export function taskChangedPaths(root) {
  const entries = gitText(root, ['status', '--porcelain', '-z', '-uall'], { trim: false }).split('\0').filter((entry) => entry !== '');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    paths.push(entries[i].slice(3));
    if (/[RC]/.test(entries[i].slice(0, 2))) paths.push(entries[++i]);
  }
  return paths;
}

function redGreenLine(task, { proofCommands, root, pending }) {
  if (task.red !== null) return { line: `Red: skipped: none (${task.red.reason})` };
  if (pending !== null) return { line: 'Red: skipped: deferred MCP proof' };
  if (proofCommands.length === 0) return { line: 'Red: skipped: no passing Bash proof command' };
  const overlay = testPaths(taskChangedPaths(root), proofCommands);
  if (overlay.length === 0) return { line: 'Red: skipped: no test file seen' };
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  let sha = '';
  for (const command of proofCommands) {
    const base = runInWorktree({ root, base: 'HEAD', command, overlay, timeoutMs, headMs: treePassMs(root, command) ?? undefined });
    sha = shortSha(base.sha);
    if (base.status === 'error') {
      throw new LandingError(`Task ${task.number}: the red-green check of "${command}" on ${sha || 'HEAD'} failed to finish:\n${base.output.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n')}`);
    }
    if (base.status === 'red') return { line: 'Red: proved' };
  }
  throw new LandingError(`Task ${task.number}: Proof ${proofCommands.map((command) => `"${command}"`).join(', ')} passes on ${sha} without the production change, so it proves nothing; tighten the test or add \`Red: none (<reason>)\` to the task`);
}

export function refuseAlreadyLanded(plan, task, { root, planId }) {
  if (!landedTasks(plan.tasks, root, planId).includes(task.number)) return;
  const [sha] = taskCommits(task, root, planId);
  throw new AlreadyLandedError(`Task ${task.number} is already landed as ${shortSha(sha)}; landing it again would add no change`);
}

export function refuseMismatchedToplevel(root) {
  const toplevel = gitText(root, ['rev-parse', '--show-toplevel']);
  if (realpathSync(toplevel) !== realpathSync(root)) throw new RefusedError(`--root '${root}' is not the checkout toplevel: git rev-parse --show-toplevel there prints '${toplevel}'`);
}

export function refuseUnfinishedMerge(root) {
  const note = unfinishedMergeNote(root);
  if (note !== null) throw new UnfinishedMergeError(note);
}

function checkReport(task, reportText, reportPath) {
  const mcpCall = mcpProofOf(task);
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, { reportText, reportPath });
  const proofCommand = pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}

function discard(toplevel, slots) {
  for (const slot of slots) {
    git(toplevel, ['worktree', 'remove', '--force', slot]);
    fs.rmSync(slot, { recursive: true, force: true });
  }
  git(toplevel, ['worktree', 'prune']);
}

function slotEnvOf(slot) {
  const file = scratchPath(slot, 'slot.env');
  if (!fs.existsSync(file)) return {};
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.startsWith('export '));
  return Object.fromEntries(lines.map((line) => {
    const at = line.indexOf('=');
    return [line.slice('export '.length, at), JSON.parse(line.slice(at + 1))];
  }));
}

function runSetup(slot, setup, variables) {
  if (setup === null || setup === 'none') return null;
  const ran = spawnSync(setup, { cwd: slot, shell: true, encoding: 'utf8', env: { ...process.env, ...variables } });
  if (ran.status === 0) return null;
  return { reason: `Worktree setup failed in ${slot}: ${`${ran.stdout}${ran.stderr}`.trim().split('\n').at(-1)}` };
}

const COMMIT_TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'merge', 'perf', 'refactor', 'revert', 'style', 'test'];
const CONVENTIONAL_SUBJECT = new RegExp(`^(${COMMIT_TYPES.join('|')})(\\([^()]+\\))?!?: [^ ]`);

function followsConventionalCommits(root) {
  const subjects = (gitLine(root, ['log', '--no-merges', '-n', '20', '--format=%s']) ?? '').split('\n').filter(Boolean);
  return subjects.filter((subject) => CONVENTIONAL_SUBJECT.test(subject)).length * 2 > subjects.length;
}

function subjectProblem(subject, root) {
  if (!followsConventionalCommits(root) || CONVENTIONAL_SUBJECT.test(subject)) return null;
  return `this repository's log uses Conventional Commits, so a subject follows them: type(scope): subject, such as feat(hooks): add the commit check. The scope is optional and the type is one of ${COMMIT_TYPES.join(', ')}.`;
}

function unmergedPaths(root) {
  const lines = (gitLine(root, ['ls-files', '-u']) ?? '').split('\n').filter(Boolean);
  return [...new Set(lines.map((line) => line.split('\t').slice(1).join('\t')))];
}

function unfinishedMerge(root) {
  const files = unmergedPaths(root);
  const mergeHead = gitLine(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  const pickHead = gitLine(root, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
  if (files.length === 0 && mergeHead === null && pickHead === null) return null;
  return { files, mergeHead, pickHead };
}

function targetName(root) {
  return gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']) ?? 'HEAD';
}

function unfinishedMergeNote(root) {
  const unfinished = unfinishedMerge(root);
  if (unfinished === null) return null;
  const paths = unfinished.files.length === 0 ? 'none left unmerged' : unfinished.files.join(', ');
  return `${targetName(root)} has an unfinished merge (unmerged paths: ${paths}); finish or abort it first`;
}
