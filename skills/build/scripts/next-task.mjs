import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { reportCap } from '#return-caps';
import { mcpToolCall } from '#mcp-tool-call';
import { proofLines, proofsReport } from '#proofs-report';
import { baselineFile, openSlots, slotOf, windowRecords } from './open-slots.mjs';
import { defaultBranch, driftOf, frameOf, isolatedCheckout, landedTasks, nextBlock, nextWave, parsePlan, PlanError, planIdOf, planRoute, regionRange, routeLine, waveLine } from '#plan-tasks';

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
  return named.length === 0 && task.files.length > SMALL_TASK_FILES ? bullets : named;
}

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

export function taskBrief(task, frame, root) {
  const rulesPath = scratchPath(root, 'run-rules.md');
  const hasRules = readable(rulesPath);
  const direction = visualDirectionLines(task, frame);
  return [
    ...(hasRules ? [`Rules: read ${rulesPath} first; it holds this run's Goal, Success criterion, report cap and boundaries.`] : [`Goal: ${frame.goal}`, ...successCriterionLines(frame)]),
    ...sectionLines(task, 'Non-goals touching these paths:', frame.nonGoals),
    ...sectionLines(task, 'Context for these paths and symbols:', frame.context),
    ...sectionLines(task, 'Decisions for these paths:', frame.decisions),
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

function inlineTaskLines(task, root) {
  const drift = driftOf(task, root);
  return [
    ...(drift.length === 0 ? ['Drift: none'] : drift.map((item) => `PLAN DRIFT: Task ${task.number}: ${item}`)),
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

function dispatchable(task, root) {
  return !task.design && driftOf(task, root).length === 0;
}

function dispatchBlock({ task, frame, planPath, checkout, briefPath, since, background }) {
  if (!dispatchable(task, checkout)) return [];
  return [`Dispatch: exo:build-task, run_in_background: ${background}`, `Since: ${since}`, ...promptLines(task, frame, planPath, checkout, briefPath)];
}

function windowLines({ planPath, root, records, running }) {
  const open = running.filter((number) => records[number] !== undefined);
  if (open.length === 0) return [];
  const waits = open.map((number) => `--since ${records[number].since} --report "${path.join(records[number].slot, '.exo', `implementer-${number}.md`)}"`);
  return [
    `Wait: node "${scriptPath('wait-report.mjs')}" --any ${waits.join(' ')}   (tool timeout 600000; exit 2 reruns, at most six runs, then BLOCKED <n> no report)`,
    ...open.map((number) => `Land ${number}: node "${scriptPath('land-slot.mjs')}" --plan "${planPath}" --task ${number} --root "${root}" --slot "${records[number].slot}" --base ${records[number].base} --baseline "${baselineFile(root)}" --in-flight ${open.filter((other) => other !== number).join(',')}`)
  ];
}

function openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since }) {
  const fresh = inFlight.length === 0;
  const opened = openSlots({ root, numbers: wave.map((task) => task.number), setup: frame.worktreeSetup, fresh, since });
  if (opened.reason !== undefined) return { reason: opened.reason, lines: [] };
  const lines = [`Base: ${opened.base}`, `Baseline: ${opened.baseline}`, '', `Dispatch all in one message, run_in_background: true; Since: ${since}`];
  for (const task of wave) {
    const slot = slotOf(opened.toplevel, task.number);
    const brief = path.join(briefDirectory, `task-${task.number}.md`);
    lines.push('', ...taskLines(task, frame, root, briefDirectory), `Slot: ${slot}`, ...(dispatchable(task, root) ? promptLines(task, frame, planPath, slot, brief) : []));
  }
  const running = [...inFlight, ...wave.map((task) => task.number)];
  return { reason: undefined, lines: [...lines, '', ...windowLines({ planPath, root: opened.toplevel, records: opened.records, running })] };
}

export function nextTaskReport({ planPath, planText, root, inFlight = [], open = false, since = Math.floor(Date.now() / 1000) }) {
  const plan = parseTasks(planPath, planText);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const route = planRoute(plan.tasks);
  const inline = route.route === 'inline';
  const ready = nextWave(plan.tasks, landed, inline || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel, inFlight);
  const wave = landed.length === 0 && inFlight.length === 0 ? ready.slice(0, 1) : ready;
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
    for (const task of unlanded) lines.push('', ...inlineTaskLines(task, root));
    return `${lines.join('\n')}\n`;
  }
  const briefDirectory = scratchPath(root, 'briefs');
  if (open && (wave.length > 1 || inFlight.length > 0)) {
    const records = windowRecords(root);
    if (wave.length === 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight })].join('\n')}\n`;
    const opened = openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since });
    if (opened.reason === undefined) return `${[...lines, ...opened.lines].join('\n')}\n`;
    lines.splice(-1, 1, `Wave discarded: ${opened.reason}`, inFlight.length > 0 ? 'Start: none' : waveLine(wave.slice(0, 1)));
    if (inFlight.length > 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight })].join('\n')}\n`;
    wave.splice(1);
  }
  for (const task of wave) {
    const taskPart = taskLines(task, frame, root, briefDirectory);
    lines.push('', ...taskPart);
    if (inFlight.length === 0 && wave.length === 1) lines.push(...dispatchBlock({ task, frame, planPath, checkout: root, briefPath: path.join(briefDirectory, `task-${task.number}.md`), since, background: false }));
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', frame: 'boolean', block: 'boolean', proofs: 'boolean', 'open-slots': 'boolean', 'in-flight': 'value' });
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
  process.stdout.write(report({ planPath: flags.plan, planText, root: flags.root ?? process.cwd(), inFlight, open: flags['open-slots'] === true }));
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
