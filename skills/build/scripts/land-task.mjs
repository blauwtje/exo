import fs from 'node:fs';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { landedTasks, planIdOf } from '#plan-landed';
import { frameOf } from '#plan-frame';
import { parsePlan, PlanError } from '#plan-tasks';
import { resolvePlanPath } from '#checkout';
import { repoState } from '#repo-state';
import { LandingError } from './land-errors.mjs';
import { locked } from './land-git.mjs';
import { checkTask, fixLand, refuseAlreadyLanded, refuseUnfinishedMerge, refuseMismatchedToplevel, taskOf, refuseBeforeProof, proveTask, clearStaleCandidate, stageCandidate, coverOrDrop, promoteAndCommit } from './land-check.mjs';
import { reportFlagOf, reportSourceOf } from './land-stopped.mjs';

const PROOF_TAIL = /^ {2}/;
const PASS_SUMMARY_LINE = /^(?:ℹ |# )?pass \d+\b|\b\d+ (?:passing|passed)\b|^Tests:/;
const TIMING_LINE = /^(?:ℹ |# )?duration_ms\b|^(?:Time|Duration|Done in)\b/;

function proofOutcomeOf(tail) {
  const lines = tail.map((line) => line.trim()).filter((line) => !TIMING_LINE.test(line));
  return `exit 0, ${lines.findLast((line) => PASS_SUMMARY_LINE.test(line)) ?? lines.at(-1) ?? 'no output'}`;
}

function landingReport({ number, sha, landed, proofs, pending, redLine, unlistedLine, missingLine, gateLine, removedBlock }) {
  const proofLines = proofs.map(({ command, tail }) => `Proof: ${[`${command}: pass (${proofOutcomeOf(tail)})`, ...tail].join('\n')}\n`).join('');
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  return `Committed: ${sha} Task ${number}\n${proofLines}${redLine}\n${unlistedLine}${missingLine}${gateLine}${removedBlock}${pendingLine}Landed: ${landed.join(', ')}\n`;
}

export function landingForCaller(text) {
  return text.split('\n').filter((line) => !PROOF_TAIL.test(line)).join('\n');
}

export function landTask({ planText, number, root, reportText = null, reportPath = null, planPath }) {
  const state = repoState(root);
  refuseMismatchedToplevel(state);
  refuseUnfinishedMerge(root);
  return locked(root, () => landLocked({ planText, number, root, state, ...reportSourceOf({ state, planId: planIdOf(planPath), number, reportText, reportPath }), planPath }));
}

function landLocked({ planText, number, root, state, reportText, reportPath, planPath }) {
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  clearStaleCandidate(state, planId);
  const task = taskOf(plan, number);
  refuseAlreadyLanded(plan, task, { state, planId });
  const { outside, unlistedLine } = refuseBeforeProof(task, { state, planPath, planId, reportText, reportPath });
  const { proofs, pending, redLine } = proveTask(task, { root, planPath, reportText, reportPath });
  const { changed, candidate, gateLine, missingLine, removedBlock } = stageCandidate({ task, frame: frameOf(plan.frame), unlistedLine, outside, state, planId });
  coverOrDrop({ task, proofs, state, changed, candidate });
  const sha = promoteAndCommit({ task, state, planId, planPath, candidate });
  const landed = landedTasks(plan.tasks, state.planCommits(), planId);
  return landingReport({ number, sha, landed, proofs, pending, redLine, unlistedLine, missingLine, gateLine, removedBlock });
}

const USAGE = [
  'usage: land-task.mjs --plan <plan> --task <n> [--root <dir>] [--report <file>|-] [--check]',
  '       land-task.mjs --fix <subject> [--body <text>] [--root <dir>]',
  'Lands a plan task from its builder report, or with --check validates it without committing; --fix commits a repair with no Plan-task trailer. Exits 2 on a usage error.'
].join('\n');

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', body: 'value', check: 'boolean' }, { usage: USAGE });
  const root = flags.root ?? process.cwd();
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, body: flags.body }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  const plan = resolvePlanPath({ plan: flags.plan, root: flags.root });
  if (flags.task === undefined || !/^\d+$/.test(flags.task)) throw new UsageError("flag '--task' names the task number");
  if (!fs.existsSync(plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const { reportPath, reportText } = reportFlagOf(flags.report);
  const run = flags.check === true ? checkTask : landTask;
  const output = run({ planText: fs.readFileSync(plan, 'utf8'), number: Number(flags.task), root, reportText, reportPath, planPath: plan });
  process.stdout.write(run === landTask ? landingForCaller(output) : output);
}

function refusal(error) {
  if (error instanceof UsageError) return { text: `land-task: ${error.message}\n`, code: 2 };
  if (error instanceof LandingError || error instanceof PlanError) return { text: `land-task: ${error.message}\n`, code: 1 };
  throw error;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const { text, code } = refusal(error);
    process.stderr.write(text);
    process.exitCode = code;
  }
}
