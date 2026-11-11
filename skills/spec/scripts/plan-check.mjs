import fs from 'node:fs';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { landedTasks, planIdOf } from '#plan-landed';
import { resolvePlanPath } from '#checkout';
import { parsePlan, PlanError } from '#plan-tasks';
import { frameOf, openPoints } from '#plan-frame';
import { taskSize } from '#plan-waves';
import { checkCommit, checkCompactFields, checkDataLiterals, checkDerivedNames, checkEvidence, checkGitAdd, checkPlaceholders, checkSize, checkSteps } from './plan-check-text.mjs';
import { checkContextSize, forkPointOf, sizeLines, warnNearCap, warnTinyTasks } from './plan-check-size.mjs';
import { checkFilesExist, checkProofTestsListed, checkSharedFiles, checkUnlistedTests, warnProofAndData } from './plan-check-files.mjs';
import { checkAcceptanceCitations, checkFrame, checkLandGate, checkParallelDisjoint, checkParallelForm, checkPlanBasis, checkProductRun, checkRedGreen, checkWorktreeSetup } from './plan-check-frame.mjs';
import { checkLoop, checkNestedClaude, checkRunCommands, realPath } from './plan-check-loop.mjs';

const SUCCESS_CRITERION = /Success criterion/;
const BASIS_LINE = /has no '(?:Repository|Branch|Land):' line/;
const FIELD_LINE = /lacks '(?:Files|Proof):'|'Boundary:'/;
const PROOF_NOT_ON_PATH = /not on this host's PATH/;
const HARD_LOOP = /^loop: (?!.*(?:redirects output|timed out|skips the full check))/;

const compactOnly = (check) => (context) => (context.compactPlan ? check(context) : []);
const classicOnly = (check) => (context) => (context.compactPlan ? [] : check(context));
const eachTask = (tasks, check) => tasks.flatMap(check);

const dataLiterals = (context) => {
  if (!context.hasRoot || !fs.existsSync(context.root)) return [];
  const planFile = context.planPath === undefined ? null : realPath(context.planPath);
  return eachTask(context.unlanded, (task) => checkDataLiterals(task, realPath(context.root), planFile));
};

export const PLAN_CHECKS = [
  { check: compactOnly(({ plan }) => checkFrame(plan.frame)), warn: true, hardWhen: SUCCESS_CRITERION },
  { check: compactOnly(({ plan, run }) => checkPlanBasis(plan.frame, run)), warn: true, hardWhen: BASIS_LINE },
  { check: compactOnly(({ planText }) => openPoints(planText).map((entry) => `the plan's '## Open points' still holds an unanswered question: ${entry}`)), warn: true },
  { check: compactOnly(({ plan, root }) => checkLandGate(plan.frame, root)), warn: true },
  { check: compactOnly(({ plan, root }) => checkProductRun(plan.frame, root)), warn: true },
  { check: compactOnly(({ plan, landed }) => checkRedGreen(plan, landed)), warn: true },
  { check: compactOnly(({ plan }) => checkAcceptanceCitations(plan.frame)), warn: true },
  { check: compactOnly(({ plan }) => checkEvidence(plan)), warn: true },
  { check: compactOnly(({ plan }) => eachTask(plan.tasks, checkCompactFields)), warn: true, hardWhen: FIELD_LINE },
  { check: classicOnly(({ plan }) => eachTask(plan.tasks, (task) => [...checkCommit(task), ...checkGitAdd(task), ...checkSteps(task), ...checkPlaceholders(task), ...checkSize(task)])), warn: true },
  { check: classicOnly(({ plan, root, byNumber }) => eachTask(plan.tasks, (task) => checkFilesExist(task, root, byNumber))), warn: true },
  { check: ({ unlanded, root, forkPoint }) => eachTask(unlanded, (task) => checkContextSize(task, root, forkPoint)), warn: true },
  { check: ({ plan, root, byNumber }) => eachTask(plan.tasks, (task) => checkUnlistedTests(task, root, byNumber)), warn: true },
  { check: ({ unlanded, root, byNumber }) => eachTask(unlanded, (task) => checkProofTestsListed(task, root, byNumber)), warn: true, hardWhen: PROOF_NOT_ON_PATH },
  { check: dataLiterals, warn: true },
  { check: ({ planText, root }) => checkDerivedNames(planText, root), warn: true },
  { check: ({ plan }) => checkSharedFiles(plan.tasks), warn: true },
  { check: ({ plan }) => checkParallelForm(plan.frame), warn: true },
  { check: ({ plan }) => checkParallelDisjoint(plan.tasks, plan.frame), warn: true },
  { check: ({ plan }) => checkWorktreeSetup(plan.tasks, plan.frame), warn: true },
  { check: ({ plan, root }) => checkNestedClaude(plan, root) },
  { check: ({ plan }) => checkRunCommands(plan) },
  { check: ({ plan, root, planPath, loop }) => (loop ? checkLoop(plan, root, planPath) : []), warn: true, hardWhen: HARD_LOOP },
  { check: ({ unlanded, root, byNumber }) => eachTask(unlanded, (task) => warnProofAndData(task, root, byNumber)), warn: true },
  { check: ({ plan, root, forkPoint, landed }) => warnTinyTasks(plan.tasks, { root, forkPoint, landed }), warn: true },
  { check: ({ plan, root, landed }) => warnNearCap(plan.tasks, root, landed), warn: true }
];

const isHardLine = (row, line) => row.warn !== true || row.hardWhen?.test(line) === true;

function runChecks(context) {
  const lines = PLAN_CHECKS.flatMap((row) => row.check(context).map((line) => ({ line, hard: isHardLine(row, line) })));
  return {
    problems: lines.filter((entry) => entry.hard).map((entry) => entry.line),
    warnings: lines.filter((entry) => !entry.hard).map((entry) => `[WARN] ${entry.line}`)
  };
}

export function planCheckReport(planText, { root, loop = false, planPath, run = false } = {}) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError("the plan holds no '### Task <n>:' heading");
  const compactPlan = plan.tasks.every((task) => task.compact);
  const resolvedRoot = root ?? frameOf(plan.frame).repository ?? undefined;
  const byNumber = new Map(plan.tasks.map((task) => [task.number, task]));
  // why: a landed task's Files: grow after it lands, and a landed task can no longer be fixed, so a resumed or mid-run check measures and flags only unlanded tasks.
  const landed = run && resolvedRoot !== undefined && resolvedRoot !== null && planPath !== undefined ? landedTasks(plan.tasks, resolvedRoot, planIdOf(planPath)) : [];
  // why: earlier tasks of a run grow the Files: of later ones, so a mid-run check measures each Files: path at the commit the run branch forked from, the size spec checked.
  const forkPoint = run && resolvedRoot !== undefined && resolvedRoot !== null ? forkPointOf(resolvedRoot) : null;
  const unlanded = plan.tasks.filter((task) => !landed.includes(task.number));
  const hasRoot = resolvedRoot !== undefined && resolvedRoot !== null;
  const context = { plan, planText, compactPlan, root: resolvedRoot, hasRoot, run, loop, planPath, byNumber, landed, unlanded, forkPoint };
  const { problems, warnings } = runChecks(context);
  if (problems.length > 0) return { ok: false, lines: [...problems, ...warnings] };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`, ...sizeLines(plan.tasks.filter((task) => !landed.includes(task.number)), resolvedRoot, forkPoint), ...warnings] };
}

const USAGE = [
  'usage: plan-check.mjs --plan <plan> [--root <dir>] [--loop] [--run]',
  'Checks a plan file against the plan rules and prints each problem and each `[WARN]` line; exits 1 only for a hard problem, 2 on a usage error.',
  '--loop adds the checks a headless run needs; --run lets a plan leave out the Land: line.'
].join('\n');

export function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', loop: 'boolean', run: 'boolean' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  const plan = resolvePlanPath({ plan: flags.plan, root: flags.root });
  if (!fs.existsSync(plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(plan, 'utf8');
  const root = flags.root ?? frameOf(parsePlan(planText).frame).repository ?? undefined;
  if (root !== undefined && !fs.existsSync(root)) {
    process.stdout.write(`Repository: ${root} does not exist\n`);
    process.exitCode = 1;
    return;
  }
  const report = planCheckReport(planText, { root: flags.root, loop: flags.loop === true, planPath: plan, run: flags.run === true });
  process.stdout.write(`${report.lines.join('\n')}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
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
