import fs from 'node:fs';
import path from 'node:path';
import { relativeFor } from '#checkout';
import { SCRATCH_FOLDER, scratchPath } from '#scratch-path';
import { refusalHandler } from '../../../lib/refusal-handlers.mjs';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { mcpToolCall } from '#mcp-tool-call';
import { driftOf, INPUT_UNREADABLE, inputPaths, isInputDrift } from '#plan-inputs';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { regionRange } from '#plan-regions';
import { SKILL_DIRECTORY } from './next-task-paths.mjs';
import { handoffLines } from './next-task-handoff.mjs';
import { headedLines, sectionLines, bulletLines } from './next-task-sections.mjs';

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

const RETURN_CAP = /\bat most (\d+|[a-z]+) lines\b/i;

function reportCap(promptText) {
  const cap = Number(RETURN_CAP.exec(promptText)?.[1]);
  return Number.isInteger(cap) ? cap : null;
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

function coveringLines(task, root) {
  const tests = coveringTests(root, task.files.map((file) => file.path));
  if (tests.length === 0) return [];
  return [`Covering: node --test --test-timeout=60000 ${tests.join(' ')}`];
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

export function taskBrief(task, frame, root, { relative = false } = {}) {
  const rulesPath = scratchPath(root, 'run-rules.md');
  const hasRules = readable(rulesPath);
  const shownRules = relative ? relativeFor(root, path.join(root, SCRATCH_FOLDER, 'run-rules.md')) : rulesPath;
  const direction = visualDirectionLines(task, frame);
  const sections = [
    ...sectionLines(task, 'Non-goals touching these paths:', frame.nonGoals),
    ...sectionLines(task, 'Context for these paths and symbols:', frame.context),
    ...headedLines(task, 'Decisions for these paths:', frame.decisions),
    ...sectionLines(task, 'Assumptions for these paths and inputs:', frame.assumptions)
  ];
  return [
    ...(hasRules ? [`Rules: read ${shownRules} first; it holds this run's Goal, Success criterion, report cap and boundaries.`] : [`Goal: ${frame.goal}`, ...successCriterionLines(frame)]),
    ...sections,
    ...inputLines(task, sections),
    ...handoffLines(task, root),
    ...(hasRules && direction.length === 1 ? [] : direction),
    ...(hasRules ? [] : reportCapLines()),
    ...deferredLines(task),
    ...coveringLines(task, root),
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

export function taskLines(task, frame, root, briefDirectory) {
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

export function inlineTaskLines(task, frame, root) {
  const drift = driftOf(task, root, frame);
  return [
    ...driftLines(task, drift),
    task.section
  ];
}

export function frameOnlyReport(planText) {
  return frameReport(frameOf(parsePlan(planText).frame));
}
