import fs from 'node:fs';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { landedTasks, planIdOf } from '#plan-landed';
import { resolvePlanPath } from '#checkout';
import { parsePlan, PlanError } from '#plan-tasks';
import { frameOf, openPoints } from '#plan-frame';
import { taskSize } from '#plan-waves';
import { checkCommit, checkCompactFields, checkDataLiterals, checkDerivedNames, checkEvidence, checkGitAdd, checkPlaceholders, checkSize, checkSteps } from './plan-check-text.mjs';
import { checkContextSize, forkPointOf, sizeLines, warnNearCap, warnTinyTasks } from './plan-check-size.mjs';
import { checkFilesExist, checkProofTestsListed, checkSharedFiles, checkUnlistedTests } from './plan-check-files.mjs';
import { checkAcceptanceCitations, checkFrame, checkLandGate, checkParallelDisjoint, checkParallelForm, checkPlanBasis, checkProductRun, checkRedGreen, checkWorktreeSetup } from './plan-check-frame.mjs';
import { checkLoop, checkNestedClaude, checkRunCommands, realPath } from './plan-check-loop.mjs';

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
  const problems = [
    ...(compactPlan
      ? [
          ...checkFrame(plan.frame),
          ...checkPlanBasis(plan.frame, run),
          ...openPoints(planText).map((entry) => `the plan's '## Open points' still holds an unanswered question: ${entry}`),
          ...checkLandGate(plan.frame, resolvedRoot),
          ...checkProductRun(plan.frame, resolvedRoot),
          ...checkRedGreen(plan, landed),
          ...checkAcceptanceCitations(plan.frame),
          ...checkEvidence(plan),
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
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkContextSize(task, resolvedRoot, forkPoint)),
    ...plan.tasks.flatMap((task) => checkUnlistedTests(task, resolvedRoot, byNumber)),
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkProofTestsListed(task, resolvedRoot, byNumber)),
    ...(resolvedRoot === undefined || resolvedRoot === null || !fs.existsSync(resolvedRoot)
      ? []
      : plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkDataLiterals(task, realPath(resolvedRoot), planPath === undefined ? null : realPath(planPath)))),
    ...checkDerivedNames(planText, resolvedRoot),
    ...checkSharedFiles(plan.tasks),
    ...checkParallelForm(plan.frame),
    ...checkParallelDisjoint(plan.tasks, plan.frame),
    ...checkWorktreeSetup(plan.tasks, plan.frame),
    ...checkNestedClaude(plan, resolvedRoot),
    ...checkRunCommands(plan),
    ...(loop ? checkLoop(plan, resolvedRoot, planPath) : [])
  ];
  const warnings = [...warnTinyTasks(plan.tasks, { root: resolvedRoot, forkPoint, landed }), ...warnNearCap(plan.tasks, resolvedRoot, landed)];
  if (problems.length > 0) return { ok: false, lines: [...problems, ...warnings] };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`, ...sizeLines(plan.tasks.filter((task) => !landed.includes(task.number)), resolvedRoot, forkPoint), ...warnings] };
}

const USAGE = [
  'usage: plan-check.mjs --plan <plan> [--root <dir>] [--loop] [--run]',
  'Checks a plan file against the plan rules and prints each problem; exits 1 when the plan fails, 2 on a usage error.',
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
