import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '#script-flags';
import { scratchPath } from '#scratch-path';
import { windowRecords } from './open-slots.mjs';
import { defaultBranch } from '#git';
import { frameOf } from '#plan-frame';
import { isolatedCheckout, nextWave, planRoute, routeLine, waveLine } from '#plan-waves';
import { landedTasks, planIdOf } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { SKILL_DIRECTORY, GATE_DIRECTORY } from './next-task-paths.mjs';
import { taskLines, inlineTaskLines } from './next-task-brief.mjs';
import { dispatchBlock, windowLines, openedLines } from './next-task-window.mjs';

function inlineSteps(planPath, root) {
  const reference = fs.readFileSync(path.join(SKILL_DIRECTORY, 'references', 'run-loop-inline.md'), 'utf8');
  return reference.split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replaceAll('${CLAUDE_SKILL_DIR}/../gate', GATE_DIRECTORY).replaceAll('${CLAUDE_SKILL_DIR}', SKILL_DIRECTORY)
      .replaceAll('<plan>', planPath).replaceAll('<checkout>', root).replaceAll('<base>', defaultBranch(root) ?? 'main'));
}

export function parseTasks(planPath, planText) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError(`${planPath} holds no '### Task <n>:' heading`);
  return plan;
}

function allIndependent(tasks, frame) {
  if (frame.parallelLine === null) return false;
  const covered = (task) => frame.parallel === null || frame.parallel.includes(task.number);
  return tasks.every((task) => task.dependsOn.length === 0 && covered(task));
}

export function nextTaskReport({ planPath, planText, root, inFlight = [], open = false, only = null, since = Math.floor(Date.now() / 1000) }) {
  const plan = parseTasks(planPath, planText);
  const frame = frameOf(plan.frame);
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const route = planRoute(plan.tasks);
  const inline = route.route === 'inline';
  const ready = nextWave(plan.tasks, landed, inline || isolatedCheckout(root, frame.repository) ? null : frame.worktreeSetup, frame.parallel, inFlight, only);
  const wave = landed.length === 0 && inFlight.length === 0 && !allIndependent(ready, frame) ? ready.slice(0, 1) : ready;
  const lines = [
    `Plan: ${planPath}`,
    `Repository: ${frame.repository ?? 'none'}`,
    `Branch: ${frame.branch ?? 'none'}`,
    `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}`,
    routeLine(route),
    only !== null && wave.length === 0 && inFlight.length === 0 ? 'Next: none, block landed' : waveLine(wave, inFlight)
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
    const unlanded = plan.tasks.map((task) => task.number).filter((number) => !landed.includes(number) && (only === null || only.includes(number)));
    if (wave.length === 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight, unlanded, only })].join('\n')}\n`;
    const opened = openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since, unlanded, only });
    if (opened.reason === undefined) return `${[...lines, ...opened.lines].join('\n')}\n`;
    lines.splice(-1, 1, `Wave discarded: ${opened.reason}`, inFlight.length > 0 ? 'Start: none' : waveLine(wave.slice(0, 1)));
    if (inFlight.length > 0) return `${[...lines, ...windowLines({ planPath, root, records, running: inFlight, unlanded, only })].join('\n')}\n`;
    wave.splice(1);
  }
  for (const task of wave) {
    const taskPart = taskLines(task, frame, root, briefDirectory);
    lines.push('', ...taskPart);
    if (inFlight.length === 0 && wave.length === 1) lines.push(...dispatchBlock({ task, frame, planPath, checkout: root, briefPath: path.join(briefDirectory, `task-${task.number}.md`), since }));
  }
  return `${lines.join('\n')}\n`;
}
