import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { dataLiterals, literalFinder } from '#data-literals';
import { environmentMs } from '#script-flags';
import { defaultBase, landedTasks, taskCommits } from '#plan-landed';
import { treePassMs } from '#check-cache';
import { mcpToolCall } from '#mcp-tool-call';
import { isTestFirst, runOnBase, testPaths } from '#red-green';
import { AlreadyLandedError, LandingError, OutsideFilesError, UnfinishedMergeError } from './land-errors.mjs';
import { PROOF_TIMEOUT_MS, PROOF_TAIL_LINES, mcpProofOf, deferredProofOf, proofCommandOf } from './land-report.mjs';
import { unplannedPaths } from './land-paths.mjs';
import { unfinishedMergeNote } from '#merge-state';

export function taskChangedPaths(root) {
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

export function redGreenLine(task, proofCommands, root, pending) {
  if (task.red !== null) return `Red: skipped: none (${task.red.reason})`;
  if (pending !== null) return 'Red: skipped: deferred MCP proof';
  if (proofCommands.length === 0) return 'Red: skipped: no passing Bash proof command';
  const overlay = testPaths(taskChangedPaths(root));
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  let sha = '';
  for (const command of proofCommands) {
    const base = runOnBase({ root, base: 'HEAD', command, overlay, timeoutMs, headMs: treePassMs(root, command) ?? undefined });
    sha = base.sha.slice(0, 7);
    if (base.status === 'error') {
      throw new LandingError(`Task ${task.number}: the red-green check of "${command}" on ${sha || 'HEAD'} failed to finish:\n${base.output.trim().split('\n').slice(-PROOF_TAIL_LINES).join('\n')}`);
    }
    if (base.status === 'red') return 'Red: proved';
  }
  throw new LandingError(`Task ${task.number}: Proof passes on ${sha} without the production change: no red proof; tighten the test or add \`Red: none (<reason>)\` to the task${untaggedBaseNote(task, root)}`);
}

// why: gate's claims-diff check refuses the same commit, but only at the end of the run.
export function refuseUntestedTestFirst(task, root) {
  if (isTestFirst(task) && testPaths(taskChangedPaths(root)).length === 0) {
    throw new LandingError(`Task ${task.number} is test-first, but its change adds or changes no test file; add the failing test the task names`);
  }
}

export function refuseAlreadyLanded(plan, task, root, planId) {
  if (!landedTasks(plan.tasks, root, planId).includes(task.number)) return;
  const [sha] = taskCommits(task, root, planId);
  throw new AlreadyLandedError(`Task ${task.number} is already landed as ${sha.slice(0, 7)}; landing it again would add no change`);
}

export function refuseMissingLiterals(task, root, planPath = null) {
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

export function refuseUnplannedPaths(task, options) {
  const unplanned = unplannedPaths(task, options);
  if (unplanned.length === 0) return;
  const unfinished = unfinishedMergeNote(options.root);
  const paths = unplanned.map((file) => `\`${file}\``).join(', ');
  throw new OutsideFilesError(`Task ${task.number} changed a path outside Files: ${paths}${unfinished === null ? '' : `; ${unfinished}`}`);
}

export function passingRunsOf(task) {
  return [...new Set(task.runs.filter((run) => run.expectsPass && mcpToolCall(run.command) === null).map((run) => run.command))];
}

export function checkReport(task, reportText, reportPath) {
  const mcpCall = task.compact ? mcpProofOf(task) : null;
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, reportText, reportPath);
  const proofCommand = task.compact && pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}
