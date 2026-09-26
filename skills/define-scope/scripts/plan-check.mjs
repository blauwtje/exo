// Checks a plan against task-list.md's per-task rules without carrying its
// code into the caller's context: a Commit: block with the task's Plan-task:
// trailer, a git add line matching Files:, Run: and Expected: on every step
// with code, no placeholder, and a size within the split threshold. Planning
// runs this instead of reading the finished plan back.

import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { codeBlocks, parsePlan, PlanError, taskSize } from '#plan-tasks';

const STEP_HEADING = /^Step \d+: .*$/;
// A run of dots on their own, not a spread or rest operator: `...args` and
// `{ ...rest }` are real code, an isolated `...` is the template's own
// placeholder for "more steps follow".
const PLACEHOLDER_ELLIPSIS = /(?<![.\w])\.\.\.(?!\w)/;
const MAX_LINES = 250;
const MAX_FILES = 4;
const MAX_COMPACT_LINES = 30;
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

// A brief (skills/define-scope/references/brief.md) carries `## Decisions`,
// `## Assumptions` and `## Acceptance` ahead of the plan frame; no define-scope
// plan has these, so stripping their content, heading included, before the
// cap counts leaves a define-scope plan's count exactly as it reads today.
const BRIEF_ONLY_SECTIONS = new Set(['Decisions', 'Assumptions', 'Acceptance']);

function stripBriefSections(planText) {
  const kept = [];
  let name = null;
  let fence = 0;
  for (const line of planText.split('\n')) {
    fence = fenceAfter(line, fence);
    const heading = fence === 0 ? line.match(/^## (.+)$/) : null;
    if (heading !== null) name = heading[1];
    if (name !== null && BRIEF_ONLY_SECTIONS.has(name)) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

// A compact plan (every task in `Depends on: ... | Files: ...` form) trades
// the old per-step rules for a line cap and the frame headings the compact
// grammar requires; a plan with even one old-format task keeps today's rules
// for every task, so an in-flight or mixed plan never changes behavior under
// this check. The cap counts non-blank lines only, so a blank separator
// between tasks (as the grammar's own example uses) never counts against it.
function checkCompactSize(planText) {
  const nonBlankCount = stripBriefSections(planText).replace(/\n$/, '').split('\n').filter((line) => line.trim() !== '').length;
  if (nonBlankCount > MAX_COMPACT_LINES) {
    return [`the plan is ${nonBlankCount} non-blank lines, past the ${MAX_COMPACT_LINES}-line compact cap`];
  }
  return [];
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

/** Reads `planText` and returns `{ ok, lines }`: the problems found, or the one ok line. */
export function planCheckReport(planText) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError("the plan holds no '### Task <n>:' heading");
  const compactPlan = plan.tasks.every((task) => task.compact);
  const problems = compactPlan
    ? [
        ...checkCompactSize(planText),
        ...checkFrame(plan.frame),
        ...checkPlanBasis(plan.frame),
        ...plan.tasks.flatMap((task) => checkCompactFields(task))
      ]
    : plan.tasks.flatMap((task) => [
        ...checkCommit(task),
        ...checkGitAdd(task),
        ...checkSteps(task),
        ...checkPlaceholders(task),
        ...checkSize(task)
      ]);
  if (problems.length > 0) return { ok: false, lines: problems };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`] };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const report = planCheckReport(planText);
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
