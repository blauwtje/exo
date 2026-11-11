import fs from 'node:fs';
import path from 'node:path';
import { frameOf, parallelValueValid } from '#plan-frame';
import { subjectProblem } from '#commit-text';
import { equalsLandGate } from '#land-gate';
import { mcpToolCall } from '#mcp-tool-call';
import { isTestPath } from '#red-green';
import { packageEntryPoints, packageRunTerms } from '#package-entry-point';
import { reachesThrough } from './plan-check-files.mjs';
import { main } from './plan-check.mjs';

export const AUTONOMY_MODES = ['auto', 'pause-flagged', 'approve-each'];
const CHECKPOINT_POINTS = ['Blocks first:', 'Parallel:', 'Shared state:', 'Smallest safe split:'];

export function checkParallelForm(frame) {
  const { parallelLine } = frameOf(frame);
  if (parallelLine === null || parallelValueValid(parallelLine)) return [];
  return [`the plan's '## Checkpoint' line 'Parallel: ${parallelLine}' does not read 'none', 'every task' or task numbers such as 'Tasks 1, 2 and 3'`];
}

export function checkParallelDisjoint(tasks, frame) {
  const named = frameOf(frame).parallel ?? [];
  const listed = tasks.filter((task) => named.includes(task.number));
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const problems = [];
  for (let i = 0; i < listed.length; i++) {
    for (let j = i + 1; j < listed.length; j++) {
      if (reachesThrough(byNumber, listed[i].number, listed[j].number) || reachesThrough(byNumber, listed[j].number, listed[i].number)) continue;
      const secondPaths = new Set(listed[j].files.map((file) => file.path));
      for (const filePath of new Set(listed[i].files.map((file) => file.path))) {
        if (secondPaths.has(filePath)) problems.push(`Task ${listed[i].number} and Task ${listed[j].number} are both on the Parallel: line but both list Files: \`${filePath}\``);
      }
    }
  }
  return problems;
}

export function checkWorktreeSetup(tasks, frame) {
  if (frameOf(frame).worktreeSetup !== null) return [];
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const first = tasks[i].number;
      const second = tasks[j].number;
      if (reachesThrough(byNumber, first, second) || reachesThrough(byNumber, second, first)) continue;
      return [`Task ${first} and Task ${second} share no Depends on chain, but the plan's '## Plan basis' has no 'Worktree setup:' line: add 'Worktree setup: <command>' or 'Worktree setup: none' so they build together`];
    }
  }
  return [];
}

export function checkPlanBasis(frame, run) {
  const basis = frame['Plan basis'] ?? '';
  const problems = [];
  if (!/^Repository: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Repository:' line");
  if (!/^Branch: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Branch:' line");
  const landOptional = run && !/^Land:/m.test(basis);
  if (!landOptional && !/^Land: (local|pr|push-main)$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Land:' line, or it is not one of local, pr, push-main");
  if (!AUTONOMY_MODES.includes(frameOf(frame).autonomy)) problems.push(`the plan's '## Plan basis' 'Autonomy: ${frameOf(frame).autonomy}' is not one of ${AUTONOMY_MODES.join(', ')}`);
  if (frameOf(frame).app?.ready === null) problems.push("the plan's '## Plan basis' 'App:' line has no 'Ready:' URL: write 'App: <start command> | Ready: <url>' or 'App: none'");
  if (/^Land: (local|push-main)$/m.test(basis)) {
    const commit = frameOf(frame).commit;
    const problem = commit === null ? 'it is missing' : subjectProblem(commit);
    if (problem !== null) problems.push(`the plan's '## Plan basis' needs a 'Commit: <type>(<scope>): <subject>' line when Land is local or push-main: ${problem}`);
  }
  return problems;
}

const TASK_CITATION = /\bTasks?\s+\d/;

export function checkAcceptanceCitations(frame) {
  const acceptance = frame.Acceptance ?? '';
  const problems = [];
  for (const line of acceptance.split('\n')) {
    const bullet = line.trim();
    if (!bullet.startsWith('- ')) continue;
    const item = bullet.slice(2);
    const anchored = TASK_CITATION.test(item) || item.includes('Data:') || item.includes('Success criterion') || item.includes('Manual checks');
    if (!anchored) {
      problems.push(`the plan's '## Acceptance' item "${item}" names no task number, 'Data:' segment, Success criterion or Manual checks line`);
    }
  }
  return problems;
}

export function checkLandGate(frame, root) {
  if (root === undefined || root === null) return [];
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];
  const basis = frame['Plan basis'] ?? '';
  const scripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts ?? {};
  const problems = [];
  if (scripts.typecheck !== undefined && !/^Land gate: .+$/m.test(basis)) {
    problems.push("the plan's '## Plan basis' has no 'Land gate:' line, though the target repository's package.json has a typecheck script to gate on: add 'Land gate: npm run typecheck' or 'Land gate: none' to opt out");
  }
  if (scripts.lint !== undefined && !/^Lint: .+$/m.test(basis)) {
    problems.push("the plan's '## Plan basis' has no 'Lint:' line, though the target repository's package.json has a lint script: add a 'Lint:' line naming the linter binary, such as 'Lint: npx eslint', since 'npm run lint' ignores the task's files, or 'Lint: none' to opt out");
  }
  return problems;
}

export function checkProductRun(frame, root) {
  if (root === undefined || root === null) return [];
  const terms = packageRunTerms(root);
  const criterion = frame['Success criterion'] ?? '';
  if (terms.length === 0 || criterion.trim() === '') return [];
  const escape = criterion.match(/^Product run: none(?: \((.*)\))?\s*$/m);
  if (escape !== null && (escape[1] ?? '').trim() !== '') return [];
  const entries = packageEntryPoints(root).join(', ');
  if (escape !== null) return [`the plan's 'Product run: none' states no reason: write 'Product run: none (<reason>)'`];
  const first = criterion.match(/`([^`]+)`/);
  const command = first === null ? '' : first[1].trim();
  const runs = mcpToolCall(command) !== null
    || terms.some((term) => new RegExp(`(?<![\\w/-])(?:\\./)?${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-]|\\.\\w)`).test(command));
  if (runs) return [];
  return [`the plan's '## Success criterion' runs no product, though package.json names ${entries}: run one in the command, or add 'Product run: none (<reason>)' under it`];
}

const REFACTOR_HEADING = /^refactor(?:\([^)]*\))?!?:/;

export function checkRedGreen(plan, landed) {
  const problems = [];
  for (const task of plan.tasks) {
    if (task.red !== null && task.red.reason === '') problems.push(`Task ${task.number}: 'Red: none' states no reason: write 'Red: none (<reason>)'`);
  }
  if (plan.successRed !== null && plan.successRed.reason === '') problems.push("the plan's Success criterion 'Red: none' states no reason: write 'Red: none (<reason>)'");
  const landGate = frameOf(plan.frame).landGate;
  for (const task of plan.tasks) {
    if (task.red !== null) continue;
    if (equalsLandGate(task.proof ?? undefined, landGate)) {
      problems.push(`Task ${task.number}: 'Proof: ${task.proof}' equals the 'Land gate:' command, so land will warn "no red proof" on it: name a Proof that fails before the task, or add 'Red: none (<reason>)'`);
    } else if (REFACTOR_HEADING.test(task.title) && !landed.includes(task.number)) {
      problems.push(`Task ${task.number}: a refactor task has no 'Red:' field, so land will warn "no red proof" on a Proof that passes before the change: add 'Red: none (<reason>)'; a Proof that fails before the change marks a behavior change, so give the heading type feat or fix instead`);
    } else if (!landed.includes(task.number) && task.files.length > 0 && task.files.every((file) => isTestPath(file.path))) {
      problems.push(`Task ${task.number}: the Files are all tests and the task has no 'Red:' field, so its Proof passes before the change and land will warn "no red proof" on it: add a source file to Files, or add 'Red: none (<reason>)'`);
    }
  }
  if (plan.successBaseline?.malformed !== undefined) problems.push("the plan's Success criterion 'Baseline:' is not '<results file> @ <commit>'");
  if (plan.benchmarkOverride === '') problems.push("the plan's Success criterion 'Benchmark-override:' states no reason");
  const repeat = plan.successRepeat;
  if (repeat !== null && !(repeat.count >= 2 && repeat.count <= 5)) problems.push("the plan's Success criterion 'Repeat:' count is not 2 to 5: write 'Repeat: <2-5> (<reason>)'");
  else if (repeat !== null && repeat.reason === '') problems.push("the plan's Success criterion 'Repeat:' states no reason: write 'Repeat: <2-5> (<reason>)'");
  const command = (plan.frame['Success criterion'] ?? '').match(/`([^`]+)`/)?.[1].trim();
  if (equalsLandGate(command, frameOf(plan.frame).landGate) && plan.successRed === null) {
    problems.push(`the plan's Success criterion '${command}' equals the 'Land gate:' command, so it cannot fail where every task passed: name a command that checks the goal, or add 'Red: none (<reason>)' under it`);
  }
  return problems;
}

export function checkFrame(frame) {
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
