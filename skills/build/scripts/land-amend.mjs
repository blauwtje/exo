import fs from 'node:fs';
import path from 'node:path';
import { decisionsPathOf, isCovered, landedTasks, planIdOf } from '#plan-landed';
import { parsePlan } from '#plan-tasks';
import { changedPaths, isProtectedPath, siblingWorkOf, unplannedPaths } from './land-paths.mjs';
import { proveTask } from './land-prove.mjs';

function isRefusedPath(changed, { root, planPath }) {
  const own = [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  return own.includes(changed) || isProtectedPath(changed);
}

function otherOpenEntries(plan, task, { root, planPath }) {
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  return plan.tasks
    .filter((other) => other.number !== task.number && !landed.includes(other.number))
    .flatMap((other) => other.files.map((file) => file.path));
}

function amendablePaths(plan, task, context) {
  if (!task.compact) return [];
  const siblingWork = siblingWorkOf(plan, task, { ...context, landing: true });
  const unplanned = unplannedPaths(task, { ...context, siblingWork });
  if (unplanned.length === 0) return [];
  const claimed = otherOpenEntries(plan, task, context);
  const changed = changedPaths(context.root, context.planPath);
  const stray = changed.filter((file) => !isCovered(task.files.map((entry) => entry.path), file));
  const refusable = stray.some((file) => isRefusedPath(file, context) || isCovered(claimed, file));
  return refusable ? [] : unplanned;
}

function proofPasses(task, context) {
  try {
    proveTask(task, context);
    return true;
  } catch {
    return false;
  }
}

function widenedPlanText(planText, task, paths) {
  const field = `Files: ${task.filesField}`;
  const widened = `${field}, ${paths.map((file) => `\`${file}\``).join(', ')}`;
  return planText.replace(task.section, task.section.replace(field, widened));
}

export function amendOutsideFiles({ planText, number, context }) {
  const plan = parsePlan(planText);
  const task = plan.tasks.find((entry) => entry.number === number);
  const paths = amendablePaths(plan, task, context);
  if (paths.length === 0 || !proofPasses(task, context)) return { planText, lines: [] };
  const widened = widenedPlanText(planText, task, paths);
  fs.writeFileSync(context.planPath, widened);
  return { planText: widened, lines: paths.map((file) => `AMEND Task ${number} ${file}`) };
}
