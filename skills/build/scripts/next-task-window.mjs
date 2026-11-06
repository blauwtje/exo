import path from 'node:path';
import { baselineFile, openSlots, slotEnvLine, slotOf } from './open-slots.mjs';
import { driftOf, relativeInputPaths } from '#plan-inputs';
import { scriptPath } from './next-task-paths.mjs';
import { taskLines } from './next-task-brief.mjs';

function promptLines(task, frame, planPath, checkout, briefPath) {
  return [
    'Prompt:',
    `Task ${task.number} of ${planPath}, branch ${frame.branch ?? 'none'}, checkout ${checkout}.`,
    `Read your brief at ${briefPath}.`,
    ...(task.files.length > 0 && task.files.every((file) => file.path.endsWith('.md')) ? ['Code rules: none'] : []),
    `Report to: ${path.join(checkout, '.exo', `implementer-${task.number}.md`)}`,
    'Return: one line'
  ];
}

function dispatchable(task, frame, root) {
  return !task.design && driftOf(task, root, frame).length === 0;
}

export function dispatchBlock({ task, frame, planPath, checkout, briefPath, since }) {
  if (!dispatchable(task, frame, checkout)) return [];
  const report = path.join(checkout, '.exo', `implementer-${task.number}.md`);
  const stamp = path.join(checkout, '.exo', `checked-${task.number}`);
  return [`Dispatch: exo:build-task`, `Since: ${since}`, `Wait: node "${scriptPath('wait-report.mjs')}" --since ${since} --report "${report}" --stamp "${stamp}"   (tool timeout 600000; exit 2 reruns at most three times, then BLOCKED <n> no report)`, ...promptLines(task, frame, planPath, checkout, briefPath)];
}

// why: with every unlanded task running no landing can start a refill, so one chained land replaces the per-slot lands.
export function windowLines({ planPath, root, records, running, unlanded = null, only = null }) {
  const open = running.filter((number) => records[number] !== undefined);
  if (open.length === 0) return [];
  const waitAll = open.length > 1 && unlanded !== null && unlanded.every((number) => open.includes(number));
  const waits = open.map((number) => `--since ${records[number].since} --report "${path.join(records[number].slot, '.exo', `implementer-${number}.md`)}" --stamp "${path.join(records[number].slot, '.exo', `checked-${number}`)}"`);
  const onlyFlag = only === null ? '' : ` --only ${only.join(',')}`;
  const land = (number) => `node "${scriptPath('land-slot.mjs')}" --plan "${planPath}" --task ${number} --root "${root}" --slot "${records[number].slot}" --base ${records[number].base} --baseline "${baselineFile(root)}"${open.length > 1 ? ` --in-flight ${open.filter((other) => other !== number).join(',')}` : ''}${onlyFlag}`;
  const order = [...open].sort((left, right) => left - right);
  return [
    `Wait: node "${scriptPath('wait-report.mjs')}"${waitAll ? '' : ' --any'} ${waits.join(' ')}   (tool timeout 600000; exit 2 reruns at most three times, then BLOCKED <n> no report)`,
    ...open.map((number) => `Land ${number}: ${land(number)}`),
    ...(waitAll ? [`Land all: ${order.map((number, index) => `${land(number)}${index < order.length - 1 ? ' --chained' : ''}`).join(' ; ')}`] : [])
  ];
}

export function openedLines({ wave, frame, planPath, root, inFlight, briefDirectory, since, unlanded, only }) {
  const fresh = inFlight.length === 0;
  const opened = openSlots({ root, numbers: wave.map((task) => task.number), setup: frame.worktreeSetup, inputs: relativeInputPaths(frame), fresh, since });
  if (opened.reason !== undefined) return { reason: opened.reason, lines: [] };
  const lines = [`Base: ${opened.base}`, `Baseline: ${opened.baseline}`, '', `Dispatch all in one message as foreground Agent calls, no run_in_background; Since: ${since}`];
  for (const task of wave) {
    const slot = slotOf(opened.toplevel, task.number);
    const brief = path.join(briefDirectory, `task-${task.number}.md`);
    lines.push('', ...taskLines(task, frame, root, briefDirectory), `Slot: ${slot}`, `Slot env: ${slotEnvLine(opened.records[task.number])} (run '. .exo/slot.env' before a proof that binds a port or writes state)`, ...(dispatchable(task, frame, root) ? promptLines(task, frame, planPath, slot, brief) : []));
  }
  const running = [...inFlight, ...wave.map((task) => task.number)];
  return { reason: undefined, lines: [...lines, '', ...windowLines({ planPath, root: opened.toplevel, records: opened.records, running, unlanded, only })] };
}
