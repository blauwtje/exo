import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isUnreachableInput } from '#plan-inputs';
import { parsePlan } from '#plan-tasks';
import { clip } from './run-report.mjs';
import { PLUGIN_ROOT, SCRIPT } from './run-session-paths.mjs';
import { breachOf, worktreeTree } from './run-worktree.mjs';
import { planHash, spawnOne } from './run-plan-session.mjs';
import { blockedStop } from './run-plan-stops.mjs';

function withoutFields(line) {
  return line.replace(/(?:Files|Proof):[^|]*/g, '');
}

function withoutAddedRed(line, changed) {
  return /\bRed:/.test(line) ? changed : changed.replace(/\s*\|\s*Red: none \([^|]*\)/, '');
}

function onlyFieldsChanged(before, after, n) {
  const old = before.split('\n');
  const now = after.split('\n');
  const from = old.findIndex((line) => line.startsWith(`### Task ${n}:`));
  const next = old.findIndex((line, index) => index > from && line.startsWith('#'));
  const inTask = (index) => from >= 0 && index > from && (next === -1 || index < next);
  return old.length === now.length && old.every((line, index) => line === now[index] || (inTask(index) && withoutFields(line) === withoutFields(withoutAddedRed(line, now[index]))));
}

function planCheckPasses(ctx) {
  return spawnSync(process.execPath, [SCRIPT.planCheck, '--plan', ctx.planPath, '--root', ctx.root, '--loop', '--run'], { encoding: 'utf8' }).status === 0;
}

function adoptRepair(ctx, text, n) {
  try {
    const fresh = parsePlan(text).tasks.find((entry) => entry.number === n);
    Object.assign(ctx.plan.tasks.find((entry) => entry.number === n), fresh);
    return true;
  } catch {
    return false;
  }
}

function noRedProofHint(report) {
  return report.includes('no red proof') ? ['The Proof passes without the production change: tighten the Proof first, and add `Red: none (<reason>)` only when no test can fail before the change.'] : [];
}

function repairPrompt(ctx, n, report) {
  return [
    `Plan repair of task ${n} in ${ctx.planPath}, repository ${ctx.root}.`,
    `Read ${path.join(PLUGIN_ROOT, 'skills', 'build', 'drift-repairer-prompt.md')} and follow its prompt; the task list spec is ${path.join(PLUGIN_ROOT, 'skills', 'spec', 'references', 'task-list.md')}.`,
    `Edit only the Files: or Proof: line of task ${n}, or add \`Red: none (<reason>)\` to its field line; any other change is rejected.`,
    ...noRedProofHint(report),
    `Drift report: ${report}`
  ].join('\n');
}

function treeBesidePlan(ctx) {
  const planInRoot = path.relative(ctx.root, fs.realpathSync(ctx.planPath));
  return worktreeTree(ctx.root, planInRoot.startsWith('..') || path.isAbsolute(planInRoot) ? null : planInRoot);
}

function treeBreach(ctx, treeBefore) {
  const treeAfter = treeBesidePlan(ctx);
  if (treeBefore === null || treeAfter === null) return 'working tree unreadable';
  return treeAfter === treeBefore ? null : 'working tree changed beyond the plan';
}

export async function repairTask(ctx, n, report) {
  const { root, planPath, say, repaired } = ctx;
  if (repaired.has(n) || isUnreachableInput(report)) return false;
  repaired.add(n);
  const before = fs.readFileSync(planPath, 'utf8');
  const treeBefore = treeBesidePlan(ctx);
  say(`task ${n} blocked, repair session: ${clip(report, 80)}`);
  const log = path.join(ctx.logDir, `iter-${ctx.iteration}-repair-${n}.log`);
  const session = await spawnOne(ctx, { prompt: repairPrompt(ctx, n, report), allow: ctx.repairAllow, settings: ctx.taskSettings, pin: `${ctx.planId}/${n}`, log, repair: true });
  if (process.env.EXO_RUN_DIR) fs.rmSync(path.join(process.env.EXO_RUN_DIR, 'blocked'), { force: true });
  const after = fs.readFileSync(planPath, 'utf8');
  const breach = breachOf(root, session.before, { tail: true }) ?? treeBreach(ctx, treeBefore);
  if (breach === null && after !== before && onlyFieldsChanged(before, after, n) && planCheckPasses(ctx) && adoptRepair(ctx, after, n)) {
    ctx.planAtStart = planHash(ctx);
    say(`task ${n} plan repaired, task runs again`);
    return true;
  }
  fs.writeFileSync(planPath, before);
  say(`task ${n} repair rejected${breach === null ? '' : `: ${breach}`}`);
  return false;
}

export function repairedNote(n, reason) {
  return `\nThe previous attempt on task ${n} reported ${clip(reason, 120)}; the plan's field line for it was repaired. Read the plan task again.`;
}

export async function repairOrBlock(ctx, n, reason) {
  if (!(await repairTask(ctx, n, reason))) return blockedStop(ctx, n, reason);
  ctx.retryNote = repairedNote(n, reason);
  return undefined;
}
