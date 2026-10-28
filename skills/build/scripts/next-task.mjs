import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { refusalHandler } from '../../../lib/refusal-handlers.mjs';
import { reportCap } from '#return-caps';
import { mcpToolCall } from '#mcp-tool-call';
import { proofLines, proofsReport } from '#proofs-report';
import { readBuildProgress, refreshBuildProgress, removeBuildProgress } from '#build-progress';
import { baselineFile, openSlots, slotOf, windowRecords } from './open-slots.mjs';
import { defaultBranch, driftOf, frameOf, INPUT_UNREADABLE, inputPaths, isInputDrift, isolatedCheckout, landedTasks, nextBlock, nextWave, parsePlan, relativeInputPaths, PlanError, planIdOf, planRoute, regionRange, routeLine, waveLine } from '#plan-tasks';

const SMALL_TASK_FILES = 2;

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function namesFile(bullet, file) {
  if (bullet.includes(file.path) || (file.region !== null && bullet.includes(file.region))) return true;
  const segments = file.path.split('/');
  const basename = new RegExp(`(?<![\\w/])${escaped(segments.at(-1))}(?!\\w)`);
  const directories = segments.slice(0, -1).map((_, index) => escaped(segments.slice(0, index + 1).join('/')));
  return basename.test(bullet) || directories.some((directory) => new RegExp(`(?<![\\w/.-])${directory}(?:/(?![\\w.-])|(?![\\w/-]))`).test(bullet));
}

function bulletsFor(task, bullets) {
  const named = bullets.filter((bullet) => task.files.some((file) => namesFile(bullet, file)));
  if (named.length === 0 && task.files.length > SMALL_TASK_FILES) return bullets;
  return bullets.filter((bullet) => named.includes(bullet) || inputPaths(bullet).length > 0);
}

function headedLines(task, heading, bullets) {
  if (bullets.length === 0 && task.files.length <= SMALL_TASK_FILES) return [];
  return [heading, ...bulletLines(bullets)];
}

function sectionLines(task, heading, bullets) {
  return headedLines(task, heading, bulletsFor(task, bullets));
}

function bulletLines(bullets) {
  return bullets.length === 0 ? ['- none'] : bullets.map((bullet) => `- ${bullet}`);
}

function visualDirectionLines(task, frame) {
  if (!task.design || frame.visualDirection === null) return ['Visual direction: none'];
  return ['Visual direction:', frame.visualDirection];
}

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
  return headedLines(task, 'Modify ranges:', modifyRanges(task, root));
}

function successCriterionLines(frame) {
  return frame.successCriterion === null ? [] : [`Success criterion: ${frame.successCriterion}`];
}

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

function reportCapLines() {
  const prompt = fs.readFileSync(path.join(SKILL_DIRECTORY, '..', '..', 'agents', 'build-task.md'), 'utf8');
  const cap = reportCap(prompt);
  return cap === null ? [] : [`Report cap: ${cap} lines`];
}

export const BOUNDARY_LINES = [
  'Make the smallest change that fully does what the user asked.',
  'Never cut correctness, security, data safety, accessibility or anything the user named to make a change smaller.',
  'Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy.'
];

export function runRules(frame) {
  return [
    `Goal: ${frame.goal}`,
    ...successCriterionLines(frame),
    'Visual direction: none, unless the brief names one',
    ...reportCapLines(),
    'Boundaries:',
    ...BOUNDARY_LINES.map((line) => `- ${line}`),
    ''
  ].join('\n');
}

function deferredLines(task) {
  const commands = [task.proof, ...task.runs.map((run) => run.command)]
    .filter((command) => command !== null && command !== undefined)
    .map((command) => command.replace(/^`(.*)`$/, '$1'));
  return [...new Set(commands.filter((command) => mcpToolCall(command) !== null))].map((command) => `Deferred: ${command}`);
}

function readable(file) {
  try {
    fs.readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function inputLines(task, sections) {
  if (!sections.some((line) => inputPaths(line).length > 0)) return [];
  return [`Inputs: read each absolute path above before building; one unreadable → end on \`Task ${task.number}: BLOCKED ${INPUT_UNREADABLE}: <path>\`, never write its content from memory.`];
}

export function taskBrief(task, frame, root) {
  const rulesPath = scratchPath(root, 'run-rules.md');
  const hasRules = readable(rulesPath);
  const direction = visualDirectionLines(task, frame);
  const sections = [
    ...sectionLines(task, 'Non-goals touching these paths:', frame.nonGoals),
    ...sectionLines(task, 'Context for these paths and symbols:', frame.context),
    ...headedLines(task, 'Decisions for these paths:', frame.decisions),
    ...sectionLines(task, 'Assumptions for these paths and inputs:', frame.assumptions)
  ];
  return [
    ...(hasRules ? [`Rules: read ${rulesPath} first; it holds this run's Goal, Success criterion, report cap and boundaries.`] : [`Goal: ${frame.goal}`, ...successCriterionLines(frame)]),
    ...sections,
    ...inputLines(task, sections),
    ...(hasRules && direction.length === 1 ? [] : direction),
    ...(hasRules ? [] : reportCapLines()),
    ...deferredLines(task),
    ...modifyRangeLines(task, root),
    '',
    ...(hasRules ? [] : ['The task section:']),
    task.section,
    ''
  ].join('\n');
}

function writeBrief(task, frame, root, briefDirectory) {
  const briefPath = path.join(briefDirectory, `task-${task.number}.md`);
  fs.writeFileSync(briefPath, taskBrief(task, frame, root));
  return briefPath;
}

function designLine(task) {
  const match = task.section.match(/(?:^|\| )Design: (.+?)(?: \||$)/m);
  return match === null ? 'Design: none' : `Design: ${match[1]}`;
}

function driftLines(task, drift) {
  if (drift.length === 0) return ['Drift: none'];
  const kind = drift.some(isInputDrift) ? 'input unreachable' : 'plan drift';
  return [...drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`), refusalHandler(kind)];
}

function taskLines(task, frame, root, briefDirectory) {
  const drift = driftOf(task, root, frame);
  return [
    `Task ${task.number}: ${task.title}`,
    designLine(task),
    ...(task.proof === null ? [] : [`Proof: ${task.proof}`]),
    ...task.section.split('\n').filter((line) => line.startsWith('Run: ')),
    ...driftLines(task, drift),
    `Brief: ${writeBrief(task, frame, root, briefDirectory)}`
  ];
}

function inlineTaskLines(task, frame, root) {
  const drift = driftOf(task, root, frame);
  return [
    ...driftLines(task, drift),
    task.section
  ];
}

const SKILL_DIRECTORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VERIFY_DIRECTORY = path.join(path.dirname(SKILL_DIRECTORY), 'verify');

function inlineSteps(planPath, root) {
  const reference = fs.readFileSync(path.join(SKILL_DIRECTORY, 'references', 'run-loop-inline.md'), 'utf8');
  return reference.split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replaceAll('${CLAUDE_SKILL_DIR}/../verify', VERIFY_DIRECTORY).replaceAll('${CLAUDE_SKILL_DIR}', SKILL_DIRECTORY)
      .replaceAll('<plan>', planPath).replaceAll('<checkout>', root).replaceAll('<base>', defaultBranch(root) ?? 'main'));
}

export function frameOnlyReport(planText) {
  return frameReport(frameOf(parsePlan(planText).frame));
}

function parseTasks(planPath, planText) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  return plan;
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
  return `${[
    `Plan: ${planPath}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(planRoute(plan.tasks)),
    blockLine(nextBlock(plan.tasks, landed), frameOf(plan.frame).visualDirection),
    ...(landed.length === 0 ? [] : proofLines(planPath, landed, root))
  ].join('\n')}\n`;
}

const scriptPath = (name) => path.join(SKILL_DIRECTORY, 'scripts', name);

function promptLines(task, frame, planPath, checkout, briefPath) {
  return [
    'Prompt:',
    `Task ${task.number} of ${planPath}, branch ${frame.branch ?? 'none'}, checkout ${checkout}.`,
    `Read your brief at ${briefPath}.`,
    `Report to: ${path.join(checkout, '.exo', `implementer-${task.number}.md`)}`,
    'Return: one line'
  ];
}

function dispatchable(task, frame, root) {
  return !task.design && driftOf(task, root, frame).length === 0;
}

function dispatchBlock({ task, frame, planPath, checkout, briefPath, since }) {
  if (!dispatchable(task, frame, checkout)) return [];
  return [`Dispatch: exo:build-task`, `Since: ${since}`, ...promptLines(task, frame, planPath, checkout, briefPath)];
}

// why: with every unlanded task running no landing can start a refill, so one chained land replaces the per-slot lands.
export function windowLines({ planPath, root, records, running, unlanded = null }) {
  const open = running.filter((number) => records[number] !== undefined);
  if (open.length === 0) return [];
  const waitAll = open.length > 1 && unlanded !== null && unlanded.every((number) => open.includes(number));
  const land = (number) => `node "${scriptPath('land-slot.mjs')}" --plan "${planPath}" --task ${number} --root "${root}" --slot "${records[number].slot}" --base ${records[number].base} --baseline "${baselineFile(root)}"${open.length > 1 ? ` --in-flight ${open.filter((other) => other !== number).join(',')}` : ''}`;
  const order = [...open].sort((left, right) => left - right);
  return [
    ...open.map((number) => `Land ${number}: ${land(number)}`),
    ...(waitAll ? [`Land all: ${order.map((number, index) => `${land(number)}${index < order.length - 1 ? ' --chained' : ''}`).join(' ; ')}`] : [])
  ];
}

function openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since, unlanded }) {
  const fresh = inFlight.length === 0;
  const opened = openSlots({ root, numbers: wave.map((task) => task.number), setup: frame.worktreeSetup, inputs: relativeInputPaths(frame), fresh, since });
  if (opened.reason !== undefined) return { reason: opened.reason, lines: [] };
  const lines = [`Base: ${opened.base}`, `Baseline: ${opened.baseline}`, '', `Dispatch all in one message as foreground Agent calls, no run_in_background; Since: ${since}`];
  for (const task of wave) {
    const slot = slotOf(opened.toplevel, task.number);
    const brief = path.join(briefDirectory, `task-${task.number}.md`);
    lines.push('', ...taskLines(task, frame, root, briefDirectory), `Slot: ${slot}`, ...(dispatchable(task, frame, root) ? promptLines(task, frame, planPath, slot, brief) : []));
  }
  const running = [...inFlight, ...wave.map((task) => task.number)];
  return { reason: undefined, lines: [...lines, '', ...windowLines({ planPath, root: opened.toplevel, records: opened.records, running, unlanded })] };
}

function allIndependent(tasks, frame) {
  if (frame.parallelLine === null) return false;
  const covered = (task) => frame.parallel === null || frame.parallel.includes(task.number);
  return tasks.every((task) => task.dependsOn.length === 0 && covered(task));
}

export function nextTaskReport({ planPath, planText, root, inFlight = [], open = false, since = Math.floor(Date.now() / 1000) }) {
  const plan = parseTasks(planPath, planText);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const route = planRoute(plan.tasks);
  const inline = route.route === 'inline';
  const ready = nextWave(plan.tasks, landed, inline || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel, inFlight);
  const wave = landed.length === 0 && inFlight.length === 0 && !allIndependent(plan.tasks, frame) ? ready.slice(0, 1) : ready;
  const lines = [
    `Plan: ${planPath}`,
    `Repository: ${frame.repository ?? 'none'}`,
    `Branch: ${frame.branch ?? 'none'}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(route),
    waveLine(wave, inFlight)
  ];
  if (inline && wave.length > 0) {
    const unlanded = plan.tasks.filter((task) => !landed.includes(task.number));
    lines.push(`Inline: ${unlanded.map((task) => `Task ${task.number}`).join(', ')}`, 'Steps:', ...inlineSteps(planPath, root));
    for (const task of unlanded) lines.push('', ...inlineTaskLines(task, frame, root));
    return `${lines.join('\n')}\n`;
  }
  const briefDirectory = scratchPath(root, 'briefs');
  if (open && (wave.length > 1 || inFlight.length > 0)) {
    const records = windowRecords(root);
    const unlanded = plan.tasks.map((task) => task.number).filter((number) => !landed.includes(number));
    if (wave.length === 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight, unlanded })].join('\n')}\n`;
    const opened = openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since, unlanded });
    if (opened.reason === undefined) return `${[...lines, ...opened.lines].join('\n')}\n`;
    lines.splice(-1, 1, `Wave discarded: ${opened.reason}`, inFlight.length > 0 ? 'Start: none' : waveLine(wave.slice(0, 1)));
    if (inFlight.length > 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight, unlanded })].join('\n')}\n`;
    wave.splice(1);
  }
  for (const task of wave) {
    const taskPart = taskLines(task, frame, root, briefDirectory);
    lines.push('', ...taskPart);
    if (inFlight.length === 0 && wave.length === 1) lines.push(...dispatchBlock({ task, frame, planPath, checkout: root, briefPath: path.join(briefDirectory, `task-${task.number}.md`), since }));
  }
  return `${lines.join('\n')}\n`;
}

// why: the status line reads this record; a failure here must never fail the calling script.
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
  '  [--open-slots] [--in-flight <n,n,...>]',
  'Prints the next unlanded task of the plan, or the report the chosen flag names; exit 0 ok, 2 bad argument.',
].join('\n');

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', frame: 'boolean', block: 'boolean', proofs: 'boolean', 'open-slots': 'boolean', 'in-flight': 'value' }, { usage: USAGE });
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
  const inFlight = (flags['in-flight'] ?? '').split(',').filter(Boolean).map(Number);
  if (inFlight.some((number) => !Number.isInteger(number))) throw new UsageError("flag '--in-flight' names task numbers, comma separated");
  const root = flags.root ?? process.cwd();
  process.stdout.write(report({ planPath: flags.plan, planText, root, inFlight, open: flags['open-slots'] === true }));
  refreshProgress({ planPath: flags.plan, planText, root });
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
