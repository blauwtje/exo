import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf } from '#plan-frame';
import { landedTasks, planIdOf, proofRecordPath } from '#plan-landed';
import { parsePlan, PlanError } from '#plan-tasks';
import { forCaller } from '#script-output';
import { refreshProgress } from './next-task.mjs';
import { refusalHandler } from '../../../lib/refusal-handlers.mjs';
import { dockerHost } from '../../../lib/services.mjs';
import { LandingError, PlanDriftError, CodeRuleError, EnvError } from './land-errors.mjs';
import { locked } from './land-git.mjs';
import { parsePin, refuseOutsidePin, refuseMismatchedToplevel } from './land-pin.mjs';
import { fixLand } from './land-fix.mjs';
import { quiet, quietText, runCoveringTests } from './land-proof.mjs';
import { appendDecisions, writeProofRecord } from './land-record.mjs';
import { proofEvidenceOf, gateEnvOf } from './land-gate.mjs';
import { taskChangedPaths } from './land-refusals.mjs';
import { checkTask, checkCodeRules } from './land-check.mjs';
import { taskOf, refuseBeforeProof, proveTask, runPreCommitGates } from './land-prove.mjs';
import { dropCandidate, clearStaleCandidate, commitCandidate, promoteCandidate, gateCandidate, committedSha } from './land-candidate.mjs';
import { landingReport, landingForCaller, withNext } from './land-output.mjs';

export function landTask({ planText, number, root, reportText = null, reportPath = '--report', planPath, pin = null, docker = dockerHost }) {
  refuseOutsidePin(pin, planPath, number);
  refuseMismatchedToplevel(root);
  return locked(root, () => landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }));
}

function landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  const task = taskOf(plan, number);
  const block = refuseBeforeProof(plan, task, { root, planPath, pin, planId });
  const pendingEvidence = proofEvidenceOf(plan, root, planId);
  const { proofs, pending, redLine } = proveTask(task, { root, planPath, docker, reportText, reportPath, pendingEvidence });
  const frame = frameOf(plan.frame);
  const warnLines = runPreCommitGates(task, frame, root);
  const changed = taskChangedPaths(root);
  const candidate = commitCandidate(block, root, task, planId);
  const gateLine = warnLines + gateCandidate(frame, root, gateEnvOf(plan, task, root, planId), candidate);
  try {
    runCoveringTests(task, proofs.map(({ command }) => command), root, changed, pendingEvidence);
  } catch (error) {
    dropCandidate(root, candidate);
    throw error;
  }
  promoteCandidate(root, task, planId, candidate);
  const sha = committedSha(task, { root, planId, planPath, base: candidate.base });
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  writeProofRecord({ root, planId, number, proofs, redLine });
  return landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine });
}


const USAGE = [
  'usage: land-task.mjs --plan <plan> --task <n> [--root <dir>] [--report <file>] [--check] [--code-rules] [--next]',
  '       land-task.mjs --fix <subject> [--body <text>] [--plan <plan>] [--root <dir>]',
  "Lands a plan task from its implementer report, or with --check validates the report without committing; --code-rules runs only the code-rule check, --next appends the next-task report, --fix commits a repair with no Plan-task trailer, --body adds the commit body after a blank line. Exits 2 on a usage error."
].join('\n');

function callerParts(output, { run, next, planPath, planText, root }) {
  if (run !== landTask) return { full: output, shown: output };
  if (next) return withNext(output, { planPath, planText, root });
  return { full: output, shown: landingForCaller(output) };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', body: 'value', check: 'boolean', 'code-rules': 'boolean', next: 'boolean' }, { usage: USAGE });
  const root = flags.root ?? process.cwd();
  const pin = parsePin(process.env.EXO_RUN_TASK);
  const codeRulesOnly = flags['code-rules'] === true;
  if (pin !== null && !codeRulesOnly && flags.check !== true) quiet.file = proofRecordPath(root, pin.planId, pin.number);
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, body: flags.body ?? null, plan: flags.plan ?? null, pin }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (codeRulesOnly) {
    process.stdout.write(checkCodeRules({ planText, number: Number(flags.task), root, planPath: flags.plan, pin }));
    return;
  }
  const reportPath = flags.report ?? path.join(root, '.exo', `implementer-${flags.task}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  const run = flags.check === true ? checkTask : landTask;
  const output = run({ planText, number: Number(flags.task), root, reportText, reportPath, planPath: flags.plan, pin });
  const { full, shown } = callerParts(output, { run, next: flags.next === true, planPath: flags.plan, planText, root });
  process.stdout.write(quiet.file === null ? forCaller({ root, name: `land-task-${flags.task}`, full, shown }) : quietText(full, true));
  if (run === landTask) refreshProgress({ planPath: flags.plan, planText, root });
}

function refusal(error) {
  if (error instanceof UsageError) return { text: `land-task: ${error.message}\n`, code: 2, usage: true };
  if (error instanceof CodeRuleError || error instanceof EnvError) return { text: `land-task: ${error.message}\n${refusalHandler(error.kind)}\n`, code: 1 };
  if (error instanceof PlanDriftError) return { text: `${error.message}\n${refusalHandler(error.kind)}\nexo-retry\n`, code: 1 };
  if (error instanceof LandingError) return { text: `land-task: ${error.message}\n${refusalHandler(error.kind)}\nexo-retry\n`, code: 1 };
  if (error instanceof PlanError) return { text: `land-task: ${error.message}\n`, code: 1 };
  throw error;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const { text, code, usage } = refusal(error);
    process.stderr.write(usage || quiet.file === null ? text : quietText(text, false));
    process.exitCode = code;
  }
}
