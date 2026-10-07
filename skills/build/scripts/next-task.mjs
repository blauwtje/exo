// Prints what the next build needs, read from the plan and the checkout's
// history instead of the session's memory: the landed set, the route the
// plan's task count sets, the next task or wave, and for each of its tasks its
// Budget:, Design:, Proof: and Run: lines, the drift of its Modify: regions
// and the path of its brief. The brief, the frame fields and the section
// verbatim, goes to a file under the
// checkout's scratch directory, so the section reaches only build-task and
// stays out of the session. On the inline route, where the session builds each
// task itself, it prints the inline steps and each task's section instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { driftOf, frameOf, isolatedCheckout, landedTasks, nextWave, parsePlan, PlanError, planIdOf, planRoute, regionRange, routeLine, taskSize, waveLine } from '#plan-tasks';

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

// On the inline route the session builds each task itself from its section,
// so the report carries the section in place of a brief, and no budget, which
// only a build-task dispatch reads.
function inlineTaskLines(task, root) {
  const drift = driftOf(task, root);
  return [
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
    task.section
  ];
}

// The inline reference's bullets are the steps; reading them here keeps that
// file their one source, and filling in the paths spares the session reading it.
const SKILL_DIRECTORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function inlineSteps(planPath, root) {
  const reference = fs.readFileSync(path.join(SKILL_DIRECTORY, 'references', 'run-loop-inline.md'), 'utf8');
  return reference.split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replaceAll('${CLAUDE_SKILL_DIR}', SKILL_DIRECTORY).replaceAll('<plan>', planPath).replaceAll('<checkout>', root));
}

// Reads only the plan's frame and prints its header sections; `main` reaches
// this under `--frame`, before a plan holds a task worth a wave.
export function frameOnlyReport(planText) {
  return frameReport(frameOf(parsePlan(planText).frame));
}

// Writes a brief file for each task of the next wave and returns the report
// that names them.
export function nextTaskReport({ planPath, planText, root }) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const route = planRoute(plan.tasks);
  const inline = route.route === 'inline';
  // The inline route builds in the run checkout, never in a wave's worktrees.
  const wave = nextWave(plan.tasks, landed, inline || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  const lines = [
    `Plan: ${planPath}`,
    `Repository: ${frame.repository ?? 'none'}`,
    `Branch: ${frame.branch ?? 'none'}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(route),
    waveLine(wave)
  ];
  if (wave.length === 0) return `${lines.join('\n')}\n`;
  // On the inline route the lead builds every unlanded task in plan order, so
  // one call prints them all, with the steps to build them.
  if (inline) {
    const unlanded = plan.tasks.filter((task) => !landed.includes(task.number));
    lines.push(`Inline: ${unlanded.map((task) => `Task ${task.number}`).join(', ')}`, 'Steps:', ...inlineSteps(planPath, root));
    for (const task of unlanded) lines.push('', ...inlineTaskLines(task, root));
    return `${lines.join('\n')}\n`;
  }
  const briefDirectory = scratchPath(root, 'briefs');
  for (const task of wave) lines.push('', ...taskLines(task, frame, root, briefDirectory));
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const frame = argv.includes('--frame');
  const flags = parseFlags(argv.filter((arg) => arg !== '--frame'), { plan: 'value', root: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (frame) {
    process.stdout.write(frameOnlyReport(planText));
    return;
  }
  process.stdout.write(nextTaskReport({ planPath: flags.plan, planText, root: flags.root ?? process.cwd() }));
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
