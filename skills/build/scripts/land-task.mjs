import fs from 'node:fs';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf } from '#plan-frame';
import { landedTasks, planIdOf, proofRecordPath } from '#plan-landed';
import { parsePlan, PlanError } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { appendRuledOut } from '../../../lib/ruled-out.mjs';
import { forCaller } from '#script-output';
import { resolvePlanPath } from '#checkout';
import { refreshProgress } from './next-task.mjs';
import { refusalTail } from '../../../lib/refusal-handlers.mjs';
import { dockerHost } from '../../../lib/services.mjs';
import { LandingError, PlanDriftError } from './land-errors.mjs';
import { locked } from './land-git.mjs';
import { parsePin, refuseOutsidePin, refuseMismatchedToplevel } from './land-pin.mjs';
import { fixLand } from './land-fix.mjs';
import { quiet, quietText } from './land-proof.mjs';
import { appendTimeline } from '../../../lib/timeline.mjs';
import { appendDecisions, writeProofRecord } from './land-record.mjs';
import { proofEvidenceOf } from './land-gate.mjs';
import { refuseAlreadyLanded, refuseUnfinishedMerge, taskChangedPaths } from './land-refusals.mjs';
import { checkTask, checkCodeRules } from './land-check.mjs';
import { amendOutsideFiles } from './land-amend.mjs';
import { taskOf, refuseBeforeProof, proveTask } from './land-prove.mjs';
import { clearStaleCandidate } from './land-candidate.mjs';
import { stageCandidate, coverOrDrop, promoteAndCommit } from './land-stage.mjs';
import { landingReport, landingForCaller, withNext } from './land-output.mjs';
import { foldCheckpoints, reportFlagOf, reportSourceOf } from './land-stopped.mjs';

export function landTask({ planText, number, root, reportText = null, reportPath = null, planPath, pin = null, docker = dockerHost }) {
  refuseOutsidePin(pin, planPath, number);
  refuseMismatchedToplevel(root);
  refuseUnfinishedMerge(root);
  return locked(root, () => ruledOutOnFailure(root, number, () => landTaskLocked({ planText, number, root, ...reportSourceOf({ root, number, reportText, reportPath }), planPath, pin, docker })));
}

function ruledOutOnFailure(root, number, land) {
  try {
    return land();
  } catch (error) {
    if (error instanceof LandingError && error.kind === 'proof failed') recordRuledOut(root, number, error);
    throw error;
  }
}

function recordRuledOut(root, number, error) {
  const paths = taskChangedPaths(root).filter((file) => !file.startsWith(`${SCRATCH_FOLDER}/`));
  const reason = error.message.split('\n').find((line) => line.trim() !== '') ?? error.message;
  appendRuledOut(root, number, paths.length === 0 ? 'no file change' : `a change to ${paths.join(', ')}`, reason);
}

function landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const early = parsePlan(planText);
  refuseAlreadyLanded(early, taskOf(early, number), root, planIdOf(planPath));
  const amended = amendOutsideFiles({ planText, number, context: { root, planPath, docker, reportText, reportPath, pendingEvidence: proofEvidenceOf(parsePlan(planText), root, planIdOf(planPath)) } });
  const report = landAmended({ planText: amended.planText, number, root, reportText, reportPath, planPath, pin, docker });
  return `${amended.lines.map((line) => `${line}\n`).join('')}${report}`;
}

function landAmended({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  foldCheckpoints(root);
  const task = taskOf(plan, number);
  refuseAlreadyLanded(plan, task, root, planId);
  const { block, warning: filesWarning, outside } = refuseBeforeProof(plan, task, { root, planPath, pin, planId, reportText, reportPath });
  const pendingEvidence = proofEvidenceOf(plan, root, planId);
  const { proofs, pending, redLine, warning: redWarning } = proveTask(task, { root, planPath, docker, reportText, reportPath, pendingEvidence });
  const frame = frameOf(plan.frame);
  const { changed, candidate, gateLine } = stageCandidate({ plan, task, frame, block, outside, root, planId, reportText });
  coverOrDrop({ task, proofs, root, changed, pendingEvidence, candidate });
  const sha = promoteAndCommit({ task, root, planId, planPath, candidate });
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  writeProofRecord({ root, planId, number, proofs, redLine });
  appendTimeline(root, 'landed', number);
  return filesWarning + redWarning + landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine });
}

const USAGE = [
  'usage: land-task.mjs --plan <plan> --task <n> [--root <dir>] [--report <file>|-] [--check] [--code-rules] [--next]',
  '       land-task.mjs --fix <subject> [--body <text>] [--plan <plan>] [--root <dir>]',
  "Lands a plan task from its implementer report (a file, or stdin with `--report -`), or with --check validates the report without committing; --code-rules runs only the code-rule check, --next appends the next-task report, --fix commits a repair with no Plan-task trailer, --body adds the commit body after a blank line. Exits 2 on a usage error."
].join('\n');

function callerParts(output, { run, next, planPath, planText, root }) {
  if (run !== landTask) return { full: output, shown: output };
  if (next) return withNext(output, { planPath, planText, root });
  return { full: output, shown: landingForCaller(output) };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', body: 'value', check: 'boolean', 'code-rules': 'boolean', next: 'boolean' }, { usage: USAGE });
  const root = flags.root ?? process.cwd();
  const plan = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const pin = parsePin(process.env.EXO_RUN_TASK);
  const codeRulesOnly = flags['code-rules'] === true;
  if (pin !== null && !codeRulesOnly && flags.check !== true) quiet.file = proofRecordPath(root, pin.planId, pin.number);
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, body: flags.body ?? null, plan: plan ?? null, pin }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(plan, 'utf8');
  if (codeRulesOnly) {
    process.stdout.write(checkCodeRules({ planText, number: Number(flags.task), root, planPath: plan, pin }));
    return;
  }
  const { reportPath, reportText } = reportFlagOf(flags.report);
  const run = flags.check === true ? checkTask : landTask;
  const output = run({ planText, number: Number(flags.task), root, reportText, reportPath, planPath: plan, pin });
  const { full, shown } = callerParts(output, { run, next: flags.next === true, planPath: plan, planText, root });
  process.stdout.write(quiet.file === null ? forCaller({ root, name: `land-task-${flags.task}`, full, shown }) : quietText(full, true));
  if (run === landTask) refreshProgress({ planPath: plan, planText, root });
}

function refusal(error) {
  if (error instanceof UsageError) return { text: `land-task: ${error.message}\n`, code: 2, usage: true };
  if (error instanceof LandingError) return { text: `${error instanceof PlanDriftError ? '' : 'land-task: '}${error.message}\n${refusalTail(error.kind)}`, code: 1 };
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
