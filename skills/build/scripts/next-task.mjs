// Prints what the next build needs, read from the plan and the checkout's
// history instead of the session's memory: the landed set, the route, the
// next task or wave, and for each of its tasks its Budget:, Design:, Proof:
// and Run: lines, the drift of its Modify: regions and the path of its brief.
// The brief, the frame fields and the section verbatim, goes to a file under
// the checkout's scratch directory, so the section reaches only build-task
// and stays out of the session. `--block` prints only the landed set and the
// next run-unit block, for the build session, which leaves the plan to the unit.
// `--proofs` prints each landed task's `Proof:` lines as land-task recorded
// them and the decision log's path, for the build report.

import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { decisionsPathOf, driftOf, frameOf, isolatedCheckout, landedTasks, nextBlock, nextWave, parsePlan, PlanError, planIdOf, planRoute, proofRecordPath, regionRange, routeLine, taskSize, waveLine } from '#plan-tasks';

// lib/delegate-budgets.json holds the build-task delegate's budget, its default
// entry merged with its exo:build-task override; reading it here keeps one
// source for the cap instead of a second copy of its numbers.
const DELEGATE_BUDGETS = JSON.parse(
  fs.readFileSync(new URL('../../../lib/delegate-budgets.json', import.meta.url), 'utf8')
);
const BUILD_TASK_BUDGET = { ...DELEGATE_BUDGETS.default, ...DELEGATE_BUDGETS.agents['exo:build-task'] };
// plan-check.mjs requires a split past 250 code lines or 4 files, so a task at
// that threshold is as large as a task ever gets: its share of the threshold,
// capped at 1, scales build-task's budget down for a smaller task.
const SPLIT_LINES = 250;
const SPLIT_FILES = 4;
// A fresh build-task holds about 18k tokens (p90) before its first read: the
// dispatch prompt, its tools and its agent definition. Its first edit lands
// near 44k (p90) whatever the task's size, and a soft line below that stops it
// before it edits, so no task's budget drops past three quarters of
// build-task's own, 45k/75k.
const MIN_BUDGET_SHARE = 0.75;

// `delegate-budget.mjs`'s hook reads a standalone `Budget: <soft>k/<hard>k`
// line from the dispatch; the wave build carries it verbatim, so a small task
// never holds a large one's context open on a stalled delegate.
function budgetLine(task) {
  const size = taskSize(task);
  const share = Math.min(1, Math.max(size.lines / SPLIT_LINES, size.files / SPLIT_FILES));
  const scale = MIN_BUDGET_SHARE + (1 - MIN_BUDGET_SHARE) * share;
  const soft = Math.round(BUILD_TASK_BUDGET.soft * scale);
  const hard = Math.round(BUILD_TASK_BUDGET.hard * scale);
  return `Budget: ${soft}k/${hard}k`;
}

// The Non-goals, Context and Decisions bullets that name one of the task's paths or
// regions; with no match, every bullet, because a brief that drops a fact
// turns it into a guess.
function bulletsFor(task, bullets) {
  const names = task.files.flatMap((file) => [file.path, file.region]).filter((name) => name !== null);
  const named = bullets.filter((bullet) => names.some((name) => bullet.includes(name)));
  return named.length === 0 ? bullets : named;
}

function bulletLines(bullets) {
  return bullets.length === 0 ? ['- none'] : bullets.map((bullet) => `- ${bullet}`);
}

function visualDirectionLines(task, frame) {
  if (!task.design || frame.visualDirection === null) return ['Visual direction: none'];
  return ['Visual direction:', frame.visualDirection];
}

// The `path:start-end` of each Modify: region's one definition, so the brief
// points build-task at that range instead of the whole file. A region
// driftOf already flags missing or duplicated stays out: no single range
// exists to give.
function modifyRanges(task, root) {
  return task.files
    .filter((file) => file.kind === 'Modify' && file.region !== null)
    .flatMap((file) => {
      const target = path.join(root, file.path);
      if (!fs.existsSync(target)) return [];
      const range = regionRange(fs.readFileSync(target, 'utf8'), file.region);
      return range === null ? [] : [`\`${file.path}:${range.start}-${range.end}\``];
    });
}

function successCriterionLines(frame) {
  return frame.successCriterion === null ? [] : [`Success criterion: ${frame.successCriterion}`];
}

// `--frame` prints the plan frame's header sections verbatim, the fields
// frameOf reads off the plan, so a plan's Goal, Non-goals, Context,
// Decisions and Visual direction reach a caller without it retyping them as prose.
function frameReport(frame) {
  return `${[
    `Goal: ${frame.goal}`,
    ...successCriterionLines(frame),
    'Non-goals touching these paths:',
    ...bulletLines(frame.nonGoals),
    'Context for these paths and symbols:',
    ...bulletLines(frame.context),
    'Decisions for these paths:',
    ...bulletLines(frame.decisions),
    ...(frame.visualDirection === null ? ['Visual direction: none'] : ['Visual direction:', frame.visualDirection])
  ].join('\n')}\n`;
}

function taskBrief(task, frame, root) {
  return [
    `Goal: ${frame.goal}`,
    ...successCriterionLines(frame),
    'Non-goals touching these paths:',
    ...bulletLines(bulletsFor(task, frame.nonGoals)),
    'Context for these paths and symbols:',
    ...bulletLines(bulletsFor(task, frame.context)),
    'Decisions for these paths:',
    ...bulletLines(bulletsFor(task, frame.decisions)),
    ...visualDirectionLines(task, frame),
    'Modify ranges:',
    ...bulletLines(modifyRanges(task, root)),
    '',
    'The task section:',
    task.section,
    ''
  ].join('\n');
}

// The brief sits in the run checkout's scratch directory, which git ignores
// and a wave's worktrees do not share, so a worktree never commits it.
function writeBrief(task, frame, root, briefDirectory) {
  const briefPath = path.join(briefDirectory, `task-${task.number}.md`);
  fs.writeFileSync(briefPath, taskBrief(task, frame, root));
  return briefPath;
}

// A compact task's `Design:` segment sits mid-line after `| `; a long task's
// `Design:` line opens its line.
function designLine(task) {
  const match = task.section.match(/(?:^|\| )Design: (.+?)(?: \||$)/m);
  return match === null ? 'Design: none' : `Design: ${match[1]}`;
}

function taskLines(task, frame, root, briefDirectory) {
  const drift = driftOf(task, root);
  return [
    `Task ${task.number}: ${task.title}`,
    budgetLine(task),
    designLine(task),
    ...(task.proof === null ? [] : [`Proof: ${task.proof}`]),
    ...task.section.split('\n').filter((line) => line.startsWith('Run: ')),
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
    `Brief: ${writeBrief(task, frame, root, briefDirectory)}`
  ];
}

// Reads only the plan's frame and prints its header sections; `main` reaches
// this under `--frame`, before a plan holds a task worth a wave.
export function frameOnlyReport(planText) {
  return frameReport(frameOf(parsePlan(planText).frame));
}

function parseTasks(planPath, planText) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  return plan;
}

// How settled the plan's `## Visual direction` is, so the build session
// routes a `Design:` task without reading that section: `named` for a frozen
// `Contract:`, the `pending at rung <n>` design-ui recorded, else `none`.
function directionOf(visualDirection) {
  const pending = visualDirection?.match(/Direction: (pending at rung \d+)/);
  if (pending) return pending[1];
  return /Contract: /.test(visualDirection ?? '') ? 'named' : 'none';
}

// The line `--block` prints: the next block, a `Design:` task with its
// direction, or none when every task landed.
function blockLine(block, visualDirection) {
  if (block.length === 0) return waveLine(block);
  if (block[0].design) return `Design: Task ${block[0].number}, direction ${directionOf(visualDirection)}`;
  return `Block: ${block.map((task) => `Task ${task.number}`).join(', ')}`;
}

// Reads no task section and writes no brief: the build session dispatches
// the block to run-unit, which runs this script without `--block`, and a
// `Design:` task by its direction per design-tasks.md.
export function blockReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  return `${[
    `Plan: ${planPath}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    blockLine(nextBlock(plan.tasks, landed), frameOf(plan.frame).visualDirection)
  ].join('\n')}\n`;
}

// The report's proof lines, read from land-task's records instead of rerun, so
// the session reads no plan, test or script to name a landed task's proof.
export function proofsReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
  const planId = planIdOf(planPath);
  const lines = landedTasks(plan.tasks, root, planId).map((number) => {
    const record = proofRecordPath(root, planId, number);
    return fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trimEnd() : `No proof: Task ${number} landed with no land-task record`;
  });
  const decisions = decisionsPathOf(planPath);
  if (fs.existsSync(decisions)) lines.push(`Decisions: ${decisions}`);
  return lines.length === 0 ? 'Landed: none\n' : `${lines.join('\n')}\n`;
}

// Writes a brief file for each task of the next wave and returns the report
// that names them.
export function nextTaskReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const wave = nextWave(plan.tasks, landed, isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  const lines = [
    `Plan: ${planPath}`,
    `Repository: ${frame.repository ?? 'none'}`,
    `Branch: ${frame.branch ?? 'none'}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    waveLine(wave)
  ];
  if (wave.length === 0) return `${lines.join('\n')}\n`;
  const briefDirectory = scratchPath(root, 'briefs');
  for (const task of wave) lines.push('', ...taskLines(task, frame, root, briefDirectory));
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', frame: 'boolean', block: 'boolean', proofs: 'boolean' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (flags.frame) {
    process.stdout.write(frameOnlyReport(planText));
    return;
  }
  let report = nextTaskReport;
  if (flags.block) report = blockReport;
  if (flags.proofs) report = proofsReport;
  process.stdout.write(report({ planPath: flags.plan, planText, root: flags.root ?? process.cwd() }));
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanError) {
      process.stderr.write(`next-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
