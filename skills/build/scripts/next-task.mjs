import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { forCaller, keepLines } from '#script-output';
import { resolvePlanPath } from '#checkout';
import { unfinishedMergeNote } from '#merge-state';
import { proofsReport, proofLines } from '#proofs-report';
import { readBuildProgress, refreshBuildProgress, removeBuildProgress } from '#build-progress';
import { landedTasks, planIdOf } from '#plan-landed';
import { frameOf } from '#plan-frame';
import { nextBlock, planRoute, routeLine, waveLine } from '#plan-waves';
import { parsePlan, PlanError } from '#plan-tasks';
import { parsePin } from './land-pin.mjs';
import { RefusedError } from './land-errors.mjs';
import { frameOnlyReport } from './next-task-brief.mjs';
import { nextTaskReport, parseTasks } from './next-task-report.mjs';

const KNOWN_TO_RUNNER = /^(?:Plan|Repository|Branch|Base|Baseline|Proof|Run): |^Drift: none$/;

export function chainedForCaller(text) {
  if (/^Inline: /m.test(text)) return text;
  return keepLines(text, (line) => !KNOWN_TO_RUNNER.test(line) && !(line.startsWith('Brief: ') && text.includes(`Read your brief at ${line.slice(7)}.`)));
}

function directionOf(visualDirection) {
  const pending = visualDirection?.match(/Direction: (pending at rung \d+)/);
  if (pending) return pending[1];
  return /Contract: /.test(visualDirection ?? '') ? 'named' : 'none';
}

function blockLine(block, visualDirection) {
  if (block.length === 0) return waveLine(block);
  if (block[0].design) return `Design: Task ${block[0].number}, direction ${directionOf(visualDirection)}`;
  return `Block: ${block.map((task) => `Task ${task.number}`).join(', ')}`;
}

export function blockReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
  if (planRoute(plan.tasks).route === 'inline') return nextTaskReport({ planPath, planText, root });
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const block = nextBlock(plan.tasks, landed);
  return `${[
    `Plan: ${planPath}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    blockLine(block, frameOf(plan.frame).visualDirection),
    ...(landed.length === 0 || block.length === 0 ? [] : proofLines(planPath, landed, root))
  ].join('\n')}\n`;
}

export function refreshProgress({ planPath, planText, root }) {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId || process.env.EXO_RUN_TASK) return;
  try {
    const record = readBuildProgress(sessionId);
    if (record === null || record.plan !== path.resolve(planPath)) return;
    const { tasks } = parsePlan(planText);
    const landed = landedTasks(tasks, record.checkout ?? root, planIdOf(planPath)).length;
    refreshBuildProgress({ sessionId, plan: record.plan, landed, total: tasks.length });
    if (landed >= tasks.length) removeBuildProgress(sessionId);
  } catch {
    return;
  }
}

const USAGE = [
  'usage: next-task.mjs --plan <file> [--root <checkout>] [--frame | --block | --proofs]',
  '  [--open-slots] [--in-flight <n,n,...>] [--only <n,n,...>]',
  'Prints the next unlanded task of the plan, or the report the chosen flag names; exit 0 ok, 2 bad argument.',
  '--only limits waves and Start: refills to the named task numbers, the Block: line of the lead.',
].join('\n');

export function taskNumbers(text, flag) {
  if (text === undefined) return null;
  const numbers = text.split(',').filter(Boolean).map(Number);
  if (numbers.some((number) => !Number.isInteger(number))) throw new UsageError(`flag '--${flag}' names task numbers, comma separated`);
  return numbers;
}

function pinnedLine() {
  try {
    const pin = parsePin(process.env.EXO_RUN_TASK);
    return pin === null ? '' : `Pinned: ${pin.planId}/${pin.number}\n`;
  } catch (error) {
    if (error instanceof RefusedError) return '';
    throw error;
  }
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', frame: 'boolean', block: 'boolean', proofs: 'boolean', 'open-slots': 'boolean', 'in-flight': 'value', only: 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  const plan = resolvePlanPath({ plan: flags.plan, root: flags.root });
  if (!fs.existsSync(plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(plan, 'utf8');
  if (flags.frame) {
    process.stdout.write(frameOnlyReport(planText));
    return;
  }
  let report = nextTaskReport;
  if (flags.block) report = blockReport;
  if (flags.proofs) report = proofsReport;
  const root = flags.root ?? process.cwd();
  const unfinished = report === nextTaskReport ? unfinishedMergeNote(root) : null;
  if (unfinished !== null) {
    process.stdout.write(`${pinnedLine()}Start: none\n${unfinished}\n`);
    return;
  }
  const inFlight = taskNumbers(flags['in-flight'], 'in-flight') ?? [];
  const only = taskNumbers(flags.only, 'only');
  const open = flags['open-slots'] === true;
  const output = (report === nextTaskReport ? pinnedLine() : '') + report({ planPath: plan, planText, root, inFlight, only, open });
  process.stdout.write(open && report === nextTaskReport ? forCaller({ root, name: `next-task-${Date.now()}`, full: output, shown: chainedForCaller(output) }) : output);
  refreshProgress({ planPath: plan, planText, root });
}

function reportFailure(error) {
  if (error instanceof UsageError) {
    process.stderr.write(`next-task: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (error instanceof PlanError) {
    process.stderr.write(`next-task: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  throw error;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    reportFailure(error);
  }
}
