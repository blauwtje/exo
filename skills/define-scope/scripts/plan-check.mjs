// Checks a plan against task-list.md's per-task rules without carrying its
// code into the caller's context: a Commit: block with the task's Plan-task:
// trailer, a git add line matching Files:, Run: and Expected: on every step
// with code, no placeholder, a size within the split threshold, every
// Modify: path present in the target repository, and no shared Files: path
// between two tasks with no Depends on chain between them. Planning runs
// this instead of reading the finished plan back.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { codeBlocks, frameOf, parsePlan, PlanError, taskSize } from '#plan-tasks';

const STEP_HEADING = /^Step \d+: .*$/;
// A run of dots on their own, not a spread or rest operator: `...args` and
// `{ ...rest }` are real code, an isolated `...` is the template's own
// placeholder for "more steps follow".
const PLACEHOLDER_ELLIPSIS = /(?<![.\w])\.\.\.(?!\w)/;
const MAX_LINES = 250;
const MAX_FILES = 4;
const CHECKPOINT_POINTS = ['Blocks first:', 'Parallel:', 'Shared state:', 'Smallest safe split:'];

// A fence closes only on a run of backticks at least as long as the one that
// opened it, mirroring plan-tasks.mjs's fence tracking, so a step boundary
// inside a shown file's own fences is not mistaken for a real step.
function fenceAfter(line, open) {
  const backticks = line.match(/^(`{3,})/);
  if (backticks === null) return open;
  if (open === 0) return backticks[1].length;
  return backticks[1].length >= open ? 0 : open;
}

function stepsOf(section) {
  const steps = [];
  let current = null;
  let fence = 0;
  for (const line of section.split('\n')) {
    fence = fenceAfter(line, fence);
    if (fence === 0 && STEP_HEADING.test(line)) {
      current = { heading: line, lines: [] };
      steps.push(current);
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  return steps.map((step) => ({ heading: step.heading, text: step.lines.join('\n') }));
}

function checkCommit(task) {
  if (task.commitBlock === null) return [`Task ${task.number}: no Commit: block`];
  if (!new RegExp(`"Plan-task: ${task.number}"`).test(task.commitBlock)) {
    return [`Task ${task.number}: Commit: block carries no "Plan-task: ${task.number}" trailer`];
  }
  return [];
}

function checkGitAdd(task) {
  if (task.commitBlock === null) return [];
  const addLine = task.commitBlock.match(/^git add (.+)$/m);
  if (addLine === null) return [`Task ${task.number}: Commit: block has no 'git add' line`];
  const added = addLine[1].trim().split(/\s+/).sort().join(' ');
  const files = task.files.map((file) => file.path).sort().join(' ');
  if (added !== files) return [`Task ${task.number}: 'git add ${addLine[1]}' does not match Files: (${files})`];
  return [];
}

function checkSteps(task) {
  const problems = [];
  for (const step of stepsOf(task.section)) {
    if (codeBlocks(step.text).length === 0) continue;
    if (!/^Run: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Run:`);
    if (!/^Expected: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Expected:`);
  }
  return problems;
}

function checkPlaceholders(task) {
  const problems = [];
  if (/\btodo\b/i.test(task.section)) problems.push(`Task ${task.number}: a TODO placeholder stands in for code`);
  if (PLACEHOLDER_ELLIPSIS.test(task.section)) problems.push(`Task ${task.number}: an '...' placeholder stands in for code`);
  if (/similar to Task/i.test(task.section)) problems.push(`Task ${task.number}: 'similar to Task' points at another task instead of showing the code`);
  return problems;
}

function checkSize(task) {
  const size = taskSize(task);
  if (size.lines > MAX_LINES || size.files > MAX_FILES) {
    return [`Task ${task.number}: split Task ${task.number} (${size.lines} code lines, ${size.files} files)`];
  }
  return [];
}

// task-list.md rule 1 asks for a verified path; a task's own Modify: entry
// names one the executor edits rather than creates, so plan-check resolves
// it against the target repository the way driftOf() does and fails the
// plan when it is missing. With no root given, and no Repository: line in
// the plan to fall back on, the check is skipped rather than guessed. A path
// an earlier task in this task's Depends on chain lists as Create: does not
// exist yet either, so it is not a miss.
function checkFilesExist(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const createdEarlier = new Set(
    [...dependencyChainOf(byNumber, task.number)]
      .flatMap((number) => byNumber.get(number).files)
      .filter((entry) => entry.kind === 'Create')
      .map((entry) => entry.path)
  );
  const problems = [];
  for (const file of task.files.filter((entry) => entry.kind === 'Modify')) {
    if (createdEarlier.has(file.path)) continue;
    if (!fs.existsSync(path.join(root, file.path))) {
      problems.push(`Task ${task.number}: 'Modify: \`${file.path}\`' does not exist in the target repository`);
    }
  }
  return problems;
}

// A depth-first walk of the Depends on edges already validated by
// parsePlan/checkOrder (no cycle, every number known), so it always halts.
// Collects every task number `from` depends on, transitively.
function dependencyChainOf(byNumber, from) {
  const stack = [...byNumber.get(from).dependsOn];
  const seen = new Set();
  while (stack.length > 0) {
    const number = stack.pop();
    if (seen.has(number)) continue;
    seen.add(number);
    stack.push(...byNumber.get(number).dependsOn);
  }
  return seen;
}

function reachesThrough(byNumber, from, to) {
  return dependencyChainOf(byNumber, from).has(to);
}

// task-list.md rule 4 asks the author to split a shared write target unless
// a real invariant earns a Depends on edge that serializes the two tasks;
// plan-check fails a plan where two tasks list the same Files: path with no
// such chain between them, in either direction, and names both tasks and
// the path.
function checkSharedFiles(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const problems = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const first = tasks[i];
      const second = tasks[j];
      const secondPaths = new Set(second.files.map((file) => file.path));
      const shared = new Set(first.files.map((file) => file.path).filter((filePath) => secondPaths.has(filePath)));
      if (shared.size === 0) continue;
      if (reachesThrough(byNumber, first.number, second.number) || reachesThrough(byNumber, second.number, first.number)) continue;
      for (const filePath of shared) {
        problems.push(`Task ${first.number} and Task ${second.number} both list Files: \`${filePath}\` with no Depends on chain between them`);
      }
    }
  }
  return problems;
}

// run-plan's SKILL.md step 1 matches a plan to a checkout by the '## Plan
// basis' section's Repository: and Branch: lines (lib/plan-tasks.mjs's
// frameOf); a compact plan with neither would parse but never be matched to
// a checkout, so plan-check fails it here instead.
function checkPlanBasis(frame) {
  const basis = frame['Plan basis'] ?? '';
  const problems = [];
  if (!/^Repository: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Repository:' line");
  if (!/^Branch: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Branch:' line");
  return problems;
}

function checkFrame(frame) {
  const problems = [];
  if ((frame.Goal ?? '').trim() === '') problems.push("the plan has no '## Goal'");
  if ((frame['Success criterion'] ?? '').trim() === '') problems.push("the plan has no '## Success criterion'");
  const checkpoint = frame.Checkpoint ?? '';
  if (checkpoint.trim() === '') {
    problems.push("the plan has no '## Checkpoint'");
  } else {
    for (const point of CHECKPOINT_POINTS) {
      if (!checkpoint.includes(point)) problems.push(`the plan's '## Checkpoint' has no '${point}' point`);
    }
  }
  return problems;
}

function checkCompactFields(task) {
  const problems = [];
  if (task.filesField === null) problems.push(`Task ${task.number}: field line lacks 'Files:'`);
  if (task.proof === null) problems.push(`Task ${task.number}: field line lacks 'Proof:'`);
  return problems;
}

/**
 * Reads `planText` and returns `{ ok, lines }`: the problems found, or the
 * one ok line. `root` names the repository the plan targets, so a task's
 * Modify: entry can be checked against it; omit it to skip that one check.
 */
export function planCheckReport(planText, { root } = {}) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError("the plan holds no '### Task <n>:' heading");
  const compactPlan = plan.tasks.every((task) => task.compact);
  // No --root from the caller falls back to the plan's own 'Repository:'
  // line, the checkout the plan names, rather than the process's cwd, which
  // define-scope's own plan-check step never shares with the plan's target.
  const resolvedRoot = root ?? frameOf(plan.frame).repository ?? undefined;
  const byNumber = new Map(plan.tasks.map((task) => [task.number, task]));
  const problems = [
    ...(compactPlan
      ? [
          ...checkFrame(plan.frame),
          ...checkPlanBasis(plan.frame),
          ...plan.tasks.flatMap((task) => checkCompactFields(task))
        ]
      : plan.tasks.flatMap((task) => [
          ...checkCommit(task),
          ...checkGitAdd(task),
          ...checkSteps(task),
          ...checkPlaceholders(task),
          ...checkSize(task),
          ...checkFilesExist(task, resolvedRoot, byNumber)
        ])),
    ...checkSharedFiles(plan.tasks)
  ];
  if (problems.length > 0) return { ok: false, lines: problems };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`] };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const report = planCheckReport(planText, { root: flags.root });
  process.stdout.write(`${report.lines.join('\n')}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`plan-check: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanError) {
      process.stderr.write(`plan-check: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
