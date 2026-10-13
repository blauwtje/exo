import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SCRATCH_FOLDER } from '#scratch-path';
import { readDecisions } from '#run-decision';
import { isFileOnDisk } from './run-session.mjs';

function reportLines(root, number) {
  const file = path.join(root, SCRATCH_FOLDER, `implementer-${number}.md`);
  if (!isFileOnDisk(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return ['Unresolved', 'Decision'].flatMap((label) => {
    const line = lines.find((entry) => new RegExp(`^(?:- )?${label}:`).test(entry));
    return line === undefined || /:\s*none\.?\s*$/i.test(line) ? [] : [`Task ${number} ${line.replace(/^- /, '')}`];
  });
}

export const money = (cost) => `$${cost.toFixed(2)}`;

const thousands = (tokens) => Math.round(tokens / 1000);

export const clip = (text, length) => (text.length > length ? `${text.slice(0, length)}...` : text);

export function clock(ms) {
  const total = Math.floor(ms / 1000);
  const two = (value) => String(value).padStart(2, '0');
  return total >= 3600 ? `${Math.floor(total / 3600)}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}` : `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

export function wallClock(date) {
  const two = (value) => String(value).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export const taskSubject = (heading) => heading.replace(/^\s*\w+(?:\([^)]*\))?!?:\s*/, '');

export const startLine = ({ number, subject, model, effort }) => `task ${number} start: ${subject} · ${model} ${effort}`;

export const landedLine = ({ number, sha, ms, turns, tokens, cost }) => `task ${number} landed ${sha.slice(0, 7)} · ${Math.round(ms / 1000)}s · ${turns} turns · ${thousands(tokens)}k tokens · ${money(cost)}`;

export function averageLines(landed) {
  if (landed.length === 0) return [];
  const sum = (field) => landed.reduce((total, entry) => total + entry[field], 0);
  const mean = (field) => sum(field) / landed.length;
  return [
    `average per task: ${Math.round(mean('ms') / 1000)}s · ${Math.round(mean('turns'))} turns · ${thousands(mean('tokens'))}k tokens · ${money(mean('cost'))}`,
    `total: ${thousands(sum('tokens'))}k tokens · ${money(sum('cost'))}`,
  ];
}

function duration(ms) {
  const total = Math.round(ms / 1000);
  const two = (value) => String(value).padStart(2, '0');
  if (total >= 3600) return `${Math.floor(total / 3600)}h ${two(Math.floor(total / 60) % 60)}m`;
  return total >= 60 ? `${Math.floor(total / 60)}m ${two(total % 60)}s` : `${total}s`;
}

export function numbersText(numbers) {
  const parts = [];
  for (const number of [...numbers].sort((left, right) => left - right)) {
    const last = parts.at(-1);
    if (last !== undefined && last.to === number - 1) last.to = number;
    else parts.push({ from: number, to: number });
  }
  return parts.map(({ from, to }) => (to - from >= 2 ? `${from}-${to}` : from === to ? `${from}` : `${from}, ${to}`)).join(', ');
}

export function summaryLines(run, stop) {
  const { plan, records, landings, logDir } = run;
  const landed = plan.tasks.map((task) => task.number).filter((number) => landings.has(number));
  const before = landed.filter((number) => landings.get(number).before).length;
  const missing = plan.tasks.map((task) => task.number).filter((number) => !landings.has(number));
  const lines = [`Landed ${landed.length} of ${plan.tasks.length} tasks${landed.length > 0 ? `: ${numbersText(landed)}` : ''}${before > 0 ? ` (${before} were already done before this run)` : ''}.`];
  if (missing.length > 0) lines.push(`Not landed: ${missing.length === 1 ? 'task' : 'tasks'} ${numbersText(missing)}. ${stop.why}.`);
  else if (stop.why !== undefined) lines.push(`${stop.why}.`);
  else lines.push(stop.gate === 'PASS' ? 'Final check passed.' : `Final check failed: ${run.verifyLines[0] ?? 'see the detail file'}.`);
  const denied = records.reduce((sum, record) => sum + record.denied.length, 0);
  if (denied > 0) lines.push(`${denied} command${denied === 1 ? ' was' : 's were'} refused by the permission rules; the detail file lists them.`);
  const refused = records.reduce((sum, record) => sum + record.refused.length, 0);
  if (refused > 0) lines.push(`${refused} command${refused === 1 ? ' was' : 's were'} refused by hooks; the detail file lists them.`);
  const decisions = process.env.EXO_RUN_DIR ? readDecisions(process.env.EXO_RUN_DIR) : [];
  if (decisions.length > 0) lines.push(`Decisions: ${decisions.length}, in ${path.join(process.env.EXO_RUN_DIR, 'decisions.md')}`);
  lines.push(`Next: ${stop.next}`);
  lines.push(`Cost ${money(records.reduce((sum, record) => sum + record.cost, 0))}, time ${duration(run.elapsed())}.`);
  lines.push(`Details: ${path.join(logDir, 'summary.txt')}`);
  return lines;
}

export function deniedLines(records) {
  const listed = (field) => records.flatMap((record) => record[field].map((command) => ({ record, command })));
  const entries = ({ record, command }) => `  iteration ${record.iteration}, task ${record.task}: ${clip(command, 120)}`;
  const denied = listed('denied');
  const refused = listed('refused');
  const lines = [];
  if (denied.length > 0) lines.push(`Denied: ${denied.length} command${denied.length === 1 ? '' : 's'} (first 120 characters each; add one to Allow: if its task needs it; full text in the iteration logs)`, ...denied.map(entries));
  if (refused.length > 0) lines.push(`Refused by hooks: ${refused.length} command${refused.length === 1 ? '' : 's'} (first 120 characters each; a hook refused them, not the permission rules; full text in the iteration logs)`, ...refused.map(entries));
  return lines;
}

export function detailLines(run, stop) {
  const { planPath, plan, branch, cap, records, landings, logDir, root } = run;
  const lines = [`Plan: ${planPath}`, `Branch: ${branch}`, `Iterations: ${records.filter((record) => record.task !== null).length} of ${cap}`, `Logs: ${logDir}`];
  const before = [...landings.values()].filter((landing) => landing.before).length;
  if (before > 0) lines.push(`${before} task${before === 1 ? '' : 's'} landed before the run.`);
  for (const task of plan.tasks) {
    const landing = landings.get(task.number);
    if (landing === undefined) lines.push(`Task ${task.number}: not landed`);
    else if (!landing.before) lines.push(`Task ${task.number}: ${landing.sha} iteration ${landing.record.iteration}, turns ${landing.record.turns}, cost ${money(landing.record.cost)}, peak context ${thousands(landing.record.peakContext)}k`);
    if (landing?.record?.peakContext > run.contextBudget) lines.push(`Task ${task.number}: peak context ${thousands(landing.record.peakContext)}k is over the ${thousands(run.contextBudget)}k budget; split similar tasks next time`);
  }
  lines.push(`Total cost: ${money(records.reduce((sum, record) => sum + record.cost, 0))}`);
  const tail = records.find((record) => record.task === null);
  if (tail !== undefined) lines.push(`Tail: ${tail.log}, turns ${tail.turns}, last line: ${tail.last || '(none)'}`);
  lines.push(...deniedLines(records));
  if (run.redGreenLine) lines.push(run.redGreenLine);
  lines.push(...run.verifyLines);
  for (const [number, landing] of landings) if (!landing.before) lines.push(...reportLines(root, number));
  if (run.uncommitted.size > 0) lines.push(`Uncommitted after a landing: ${[...run.uncommitted].join(', ')}`);
  const manual = (plan.frame['Manual checks'] ?? '').split('\n').filter((line) => line.startsWith('- '));
  if (manual.length > 0) lines.push('Manual checks:', ...manual);
  const decisions = process.env.EXO_RUN_DIR ? readDecisions(process.env.EXO_RUN_DIR) : [];
  if (decisions.length > 0) lines.push('Decisions:', ...decisions);
  lines.push(`run-plan: stop: ${stop.line}`);
  return lines;
}
