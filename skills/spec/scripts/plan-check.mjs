import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { onPath } from '#basics';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { parsePlan, PlanError } from '#plan-tasks';
import { frameOf, openPoints } from '#plan-frame';

const REQUIRED_SECTIONS = ['Goal', 'Plan basis', 'Success criterion'];

function frameProblems(plan, planText) {
  const problems = REQUIRED_SECTIONS.filter((name) => !plan.frame[name]).map((name) => `the plan has no '## ${name}' section`);
  const criterion = plan.frame['Success criterion'] ?? '';
  if (criterion && !/`[^`]+`/.test(criterion)) problems.push("the Success criterion holds no backticked command");
  const basis = plan.frame['Plan basis'] ?? '';
  for (const label of ['Repository', 'Branch', 'Land gate']) {
    if (basis && !new RegExp(`^${label}: .+$`, 'm').test(basis)) problems.push(`the Plan basis has no '${label}:' line`);
  }
  return [...problems, ...openPoints(planText).map((entry) => `the plan's '## Open points' still holds an unanswered question: ${entry}`)];
}

function taskProblems(task) {
  const problems = [];
  const at = `Task ${task.number}`;
  if (!task.compact) problems.push(`${at}: the field line must read 'Depends on: | Files: | Data: | Proof:'`);
  if (task.files.length === 0) problems.push(`${at} lacks 'Files:'`);
  const data = task.data?.trim() ?? '';
  if (data === '' || (/^none\b/.test(data) && !/^none \(.+\)$/.test(data))) problems.push(`${at} lacks 'Data:' (its exact interface, or 'none (<reason>)')`);
  if (task.proof === null || task.proof.trim() === '') problems.push(`${at} lacks 'Proof:'`);
  if (/\b(?:TBD|TODO|XXX)\b/.test(task.section)) problems.push(`${at} holds a placeholder`);
  return problems;
}

function reaches(byNumber, from, target) {
  return byNumber.get(from).dependsOn.some((number) => number === target || reaches(byNumber, number, target));
}

function sharedFileProblems(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  return tasks.flatMap((later, index) => tasks.slice(0, index).flatMap((earlier) => {
    const shared = later.files.find((file) => earlier.files.some((other) => other.path === file.path));
    if (shared === undefined || reaches(byNumber, later.number, earlier.number) || reaches(byNumber, earlier.number, later.number)) return [];
    return `Task ${earlier.number} and Task ${later.number} both list '${shared.path}' with no 'Depends on:' path between them`;
  }));
}

function readerProblems(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  return tasks.flatMap((task) => [...(task.data ?? '').matchAll(/read by Task (\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((reader) => !byNumber.has(reader) || !reaches(byNumber, reader, task.number))
    .map((reader) => `Task ${task.number} says 'read by Task ${reader}' but Task ${reader} does not depend on Task ${task.number}`));
}

function consumesProblems(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  return tasks.flatMap((task) => task.consumes
    .filter(({ task: source }) => !byNumber.has(source) || !reaches(byNumber, task.number, source))
    .map(({ task: source }) => `Task ${task.number} consumes Task ${source} but Task ${task.number} does not depend on Task ${source}`));
}

function cites(item, plan) {
  if (/\bTask \d+\b|\bData:|Success criterion|Manual check/i.test(item)) return true;
  return [...item.matchAll(/`([^`]+)`/g)].some((span) => plan.tasks.some((task) => task.data?.includes(span[1])));
}

function acceptanceProblems(plan) {
  return (plan.frame.Acceptance ?? '').split('\n')
    .flatMap((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1] ?? [])
    .filter((item) => !cites(item, plan))
    .map((item) => `the Acceptance item '${item}' cites no task number, 'Data:' segment or the Success criterion; cite one or move it to Manual checks`);
}

function reviewFocusProblems(plan) {
  const count = (frameOf(plan.frame).reviewFocus ?? '').split('\n').filter((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length;
  return count > 5 ? [`the Review Focus holds ${count} bullets; keep at most 5`] : [];
}

function repositoryRoot(plan) {
  const root = (plan.frame['Plan basis'] ?? '').match(/^Repository: (.+)$/m)?.[1].trim();
  return root !== undefined && fs.existsSync(root) ? root : undefined;
}

function ignoredFileProblems(plan) {
  const root = repositoryRoot(plan);
  if (root === undefined) return [];
  const paths = [...new Set(plan.tasks.flatMap((task) => task.files.map((file) => file.path)))];
  const result = spawnSync('git', ['-C', root, 'check-ignore', '-z', '--stdin'], { input: paths.join('\0'), encoding: 'utf8' });
  const ignored = new Set(result.stdout.split('\0'));
  return plan.tasks.flatMap((task) => task.files
    .filter((file) => ignored.has(file.path))
    .map((file) => `Task ${task.number}: '${file.path}' is ignored by git, so the task cannot land`));
}

function folderWarnings(plan) {
  const root = repositoryRoot(plan);
  if (root === undefined) return [];
  const seen = new Set();
  return plan.tasks.flatMap((task) => task.files.flatMap((file) => {
    const folder = path.dirname(file.path.replace(/\/$/, ''));
    if (seen.has(folder) || fs.existsSync(path.resolve(root, folder))) return [];
    seen.add(folder);
    return `[WARN] Task ${task.number}: the folder of '${file.path}' does not exist and no earlier task creates it`;
  }));
}

function warnings(plan) {
  const proofWarnings = plan.tasks
    .filter((task) => task.proof && !onPath(task.proof.trim().split(/\s+/)[0]))
    .map((task) => `[WARN] Task ${task.number}: proof binary '${task.proof.trim().split(/\s+/)[0]}' is not on this host's PATH`);
  return [...proofWarnings, ...folderWarnings(plan)];
}

export function planCheckReport(planText) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError("the plan holds no '### Task <n>:' heading");
  const problems = [...frameProblems(plan, planText), ...plan.tasks.flatMap(taskProblems), ...sharedFileProblems(plan.tasks), ...readerProblems(plan.tasks), ...consumesProblems(plan.tasks), ...acceptanceProblems(plan), ...reviewFocusProblems(plan), ...ignoredFileProblems(plan)];
  if (problems.length > 0) return { ok: false, lines: problems };
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks`, ...warnings(plan)] };
}

const USAGE = 'usage: plan-check.mjs --plan <plan>\nPrints each problem; exits 1 on a problem, 2 on a usage error.';

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const report = planCheckReport(fs.readFileSync(flags.plan, 'utf8'));
  process.stdout.write(`${report.lines.join('\n')}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError || error instanceof PlanError)) throw error;
    process.stderr.write(`plan-check: ${error.message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
