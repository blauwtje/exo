// Prints what the next build needs, read from the plan and the checkout's
// history instead of the session's memory: the landed set, the route, the
// next task or wave, and for each of its tasks its Design:, Proof:
// and Run: lines, the drift of its Modify: regions and the path of its brief.
// The brief, the frame fields and the section verbatim, goes to a file under
// the checkout's scratch directory, so the section reaches only build-task
// and stays out of the session. `--block` prints only the landed set and the
// next run-unit block, for the build session, which leaves the plan to the unit,
// then each landed task's proof lines as `--proofs` prints them.
// On the inline route, where the session builds each task itself, both print
// the inline steps and each unlanded task's section instead.
// `--proofs` prints each landed task's `Proof:` lines as land-task recorded
// them and the decision log's path; no step copies them into the final message,
// since `verify` writes them to the run report.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { reportCap } from '#return-caps';
import { mcpToolCall } from '#mcp-tool-call';
import { proofLines, proofsReport } from '#proofs-report';
import { driftOf, frameOf, isolatedCheckout, landedTasks, nextBlock, nextWave, parsePlan, PlanError, planIdOf, planRoute, regionRange, routeLine, waveLine } from '#plan-tasks';

// The Non-goals, Context and Decisions bullets that name one of the task's paths or
// regions; with no match, every bullet for a task of three or more files,
// because a brief that drops a fact turns it into a guess, and none for a
// task of at most two files, whose brief stays small.
const SMALL_TASK_FILES = 2;

function bulletsFor(task, bullets) {
  const names = task.files.flatMap((file) => [file.path, file.region]).filter((name) => name !== null);
  const named = bullets.filter((bullet) => names.some((name) => bullet.includes(name)));
  return named.length === 0 && task.files.length > SMALL_TASK_FILES ? bullets : named;
}

// A heading with its bullets; a small task's empty heading is left out.
function sectionLines(task, heading, bullets) {
  const lines = bulletsFor(task, bullets);
  if (lines.length === 0 && task.files.length <= SMALL_TASK_FILES) return [];
  return [heading, ...bulletLines(lines)];
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

function modifyRangeLines(task, root) {
  const ranges = modifyRanges(task, root);
  if (ranges.length === 0 && task.files.length <= SMALL_TASK_FILES) return [];
  return ['Modify ranges:', ...bulletLines(ranges)];
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

// build-task's stated report cap, so the brief carries the number the agent
// writes to.
function reportCapLines() {
  const prompt = fs.readFileSync(path.join(SKILL_DIRECTORY, '..', '..', 'agents', 'build-task.md'), 'utf8');
  const cap = reportCap(prompt);
  return cap === null ? [] : [`Report cap: ${cap} lines`];
}

// The Proof: and Run: commands that name an MCP tool, which only the session
// can call, so a builder reads them off the brief instead of probing each one.
function deferredLines(task) {
  const commands = [task.proof, ...task.runs.map((run) => run.command)]
    .filter((command) => command !== null && command !== undefined)
    .map((command) => command.replace(/^`(.*)`$/, '$1'));
  return [...new Set(commands.filter((command) => mcpToolCall(command) !== null))].map((command) => `Deferred: ${command}`);
}

// The brief's text: the frame fields that name the task's paths, then the
// task section once. `run-plan.mjs` prints it in the session's prompt.
export function taskBrief(task, frame, root) {
  return [
    `Goal: ${frame.goal}`,
    ...successCriterionLines(frame),
    ...sectionLines(task, 'Non-goals touching these paths:', frame.nonGoals),
    ...sectionLines(task, 'Context for these paths and symbols:', frame.context),
    ...sectionLines(task, 'Decisions for these paths:', frame.decisions),
    ...visualDirectionLines(task, frame),
    ...reportCapLines(),
    ...deferredLines(task),
    ...modifyRangeLines(task, root),
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
    designLine(task),
    ...(task.proof === null ? [] : [`Proof: ${task.proof}`]),
    ...task.section.split('\n').filter((line) => line.startsWith('Run: ')),
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
    `Brief: ${writeBrief(task, frame, root, briefDirectory)}`
  ];
}

// On the inline route the session builds each task itself from its section,
// so the report carries the section in place of a brief.
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
  // The inline route has no block: the session builds every task itself.
  if (planRoute(plan.tasks).route === 'inline') return nextTaskReport({ planPath, planText, root });
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  return `${[
    `Plan: ${planPath}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    blockLine(nextBlock(plan.tasks, landed), frameOf(plan.frame).visualDirection),
    ...(landed.length === 0 ? [] : proofLines(planPath, landed, root))
  ].join('\n')}\n`;
}

// Writes a brief file for each task of the next wave and returns the report
// that names them.
export function nextTaskReport({ planPath, planText, root }) {
  const plan = parseTasks(planPath, planText);
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
