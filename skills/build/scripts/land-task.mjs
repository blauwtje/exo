import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf } from '#plan-frame';
import { landedTasks, planIdOf, proofRecordPath, decisionsPathOf } from '#plan-landed';
import { BLOCK_TASK_LIMIT, isolatedCheckout, nextWave, planRoute, routeLine, waveLine } from '#plan-waves';
import { parsePlan, PlanError } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { appendRuledOut } from '../../../lib/ruled-out.mjs';
import { forCaller, keepLines } from '#script-output';
import { resolvePlanPath } from '#checkout';
import { refreshProgress, taskNumberFlag } from './next-task.mjs';
import { refusalTail } from '../../../lib/refusal-handlers.mjs';
import { dockerHost } from '../../../lib/services.mjs';
import { LandingError, PlanDriftError } from './land-errors.mjs';
import { locked } from './land-git.mjs';
import { parsePin, refuseOutsidePin, refuseMismatchedToplevel } from './land-pin.mjs';
import { fixLand } from './land-fix.mjs';
import { scriptPath } from './run-session-paths.mjs';
import { runDefaults } from './run-config.mjs';
import { quiet, quietText } from './land-proof.mjs';
import { appendTimeline } from '../../../lib/timeline.mjs';
import { unlandedEvidenceOf } from './land-gate.mjs';
import { refuseAlreadyLanded, refuseUnfinishedMerge, taskChangedPaths } from './land-refusals.mjs';
import { checkTask, checkCodeRules } from './land-check.mjs';
import { taskOf, refuseBeforeProof, proveTask } from './land-prove.mjs';
import { clearStaleCandidate } from './land-candidate.mjs';
import { stageCandidate, coverOrDrop, promoteAndCommit } from './land-stage.mjs';
import { foldCheckpoints, reportFlagOf, reportSourceOf } from './land-stopped.mjs';

const CHOICE_LINE = /^\s*(?:[-*]\s+)?Choice:\s*(.+?)\s*$/;

function appendDecisions({ planPath, reportText, taskCount, number, sha }) {
  if (planPath === undefined || reportText === null || taskCount <= BLOCK_TASK_LIMIT) return;
  const choices = reportText.replace(/\r\n/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(CHOICE_LINE);
    return match === null ? [] : [`Task ${number} ${sha}: ${match[1]}\n`];
  });
  if (choices.length > 0) fs.appendFileSync(decisionsPathOf(planPath), choices.join(''));
}


const PASS_SUMMARY_LINE = /^(?:ℹ |# )?pass \d+\b|\b\d+ (?:passing|passed)\b|^Tests:/;
const TIMING_LINE = /^(?:ℹ |# )?duration_ms\b|^(?:Time|Duration|Done in)\b/;

function proofOutcomeOf(tail) {
  const lines = tail.map((line) => line.trim()).filter((line) => !TIMING_LINE.test(line));
  const outcome = lines.findLast((line) => PASS_SUMMARY_LINE.test(line)) ?? lines.at(-1) ?? 'no output';
  return `exit 0, ${outcome}`;
}

function writeProofRecord({ root, planId, number, proofs, redLine }) {
  const lines = [...proofs.map(({ command, tail }) => `Proof: \`${command}\` -> ${proofOutcomeOf(tail)}\n`), `${redLine}\n`];
  const record = proofRecordPath(root, planId, number);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, lines.join(''));
}

function nextLine(wave, planPath, root) {
  if (wave.length === 0) return waveLine(wave);
  return `Then: node "${scriptPath('next-task.mjs')}" --block --plan "${planPath}" --root "${root}"`;
}


function landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine }) {
  const proofLines = proofs.map(({ command, tail }) => `Proof: ${[`${command}: pass (${proofOutcomeOf(tail)})`, ...tail].join('\n')}\n`).join('');
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  const route = planRoute(plan.tasks);
  const wave = nextWave(plan.tasks, landed, { worktreeSetup: route.route === 'inline' || isolatedCheckout(root, frame.repository) ? null : frame.worktreeSetup, parallel: frame.parallel, limit: runDefaults(os.homedir()).waveLimit });
  return `Committed: ${sha} Task ${number}\n${proofLines}${gateLine}${pendingLine}Landed: ${landed.join(', ')}\n${routeLine(route)}\n${nextLine(wave, planPath, root)}\n`;
}


const PROOF_TAIL = /^ {2}/;
const NEXT_REPEATS = /^(?:Landed|Route|Then): /;

export function landingForCaller(text, { followed = false } = {}) {
  return keepLines(text, (line) => !PROOF_TAIL.test(line) && !(followed && NEXT_REPEATS.test(line)));
}

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
  appendRuledOut(root, number, { tried: paths.length === 0 ? 'no file change' : `a change to ${paths.join(', ')}`, because: reason });
}

function landTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const early = parsePlan(planText);
  refuseAlreadyLanded(early, taskOf(early, number), { root, planId: planIdOf(planPath) });
  return landPlanned({ planText, number, root, reportText, reportPath, planPath, pin, docker });
}

function landPlanned({ planText, number, root, reportText, reportPath, planPath, pin, docker }) {
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  foldCheckpoints(root);
  const task = taskOf(plan, number);
  refuseAlreadyLanded(plan, task, { root, planId });
  const { block, warning: filesWarning, outside } = refuseBeforeProof(plan, task, { root, planPath, pin, planId, reportText, reportPath });
  const pendingEvidence = unlandedEvidenceOf({ plan, root, planId });
  const { proofs, pending, redLine, warning: redWarning } = proveTask(task, { root, planPath, docker, reportText, reportPath, pendingEvidence });
  const frame = frameOf(plan.frame);
  const { changed, candidate, gateLine } = stageCandidate({ plan, task, frame, block, outside, root, planId, reportText });
  coverOrDrop({ task, proofs, root, changed, pendingEvidence, candidate });
  const sha = promoteAndCommit({ task, root, planId, planPath, candidate });
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  writeProofRecord({ root, planId, number, proofs, redLine });
  appendTimeline(root, { event: 'landed', task: number });
  return filesWarning + redWarning + landingReport({ plan, frame, root, planPath, number, sha, landed, proofs, pending, gateLine });
}

const USAGE = [
  'usage: land-task.mjs --plan <plan> --task <n> [--root <dir>] [--report <file>|-] [--check] [--code-rules]',
  '       land-task.mjs --fix <subject> [--body <text>] [--plan <plan>] [--root <dir>]',
  "Lands a plan task from its implementer report (a file, or stdin with `--report -`), or with --check validates the report without committing; --code-rules runs only the code-rule check, --fix commits a repair with no Plan-task trailer, --body adds the commit body after a blank line. Exits 2 on a usage error."
].join('\n');

function callerParts(output, { run }) {
  if (run !== landTask) return { full: output, shown: output };
  return { full: output, shown: landingForCaller(output) };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', body: 'value', check: 'boolean', 'code-rules': 'boolean' }, { usage: USAGE });
  const root = flags.root ?? process.cwd();
  const plan = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const pin = parsePin(process.env.EXO_RUN_TASK);
  const codeRulesOnly = flags['code-rules'] === true;
  if (pin !== null && !codeRulesOnly && flags.check !== true) quiet.file = proofRecordPath(root, pin.planId, pin.number);
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, body: flags.body, plan, pin }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  const number = taskNumberFlag(flags);
  if (!fs.existsSync(plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(plan, 'utf8');
  if (codeRulesOnly) {
    process.stdout.write(checkCodeRules({ planText, number, root, planPath: plan, pin }));
    return;
  }
  const { reportPath, reportText } = reportFlagOf(flags.report);
  const run = flags.check === true ? checkTask : landTask;
  const output = run({ planText, number, root, reportText, reportPath, planPath: plan, pin });
  const { full, shown } = callerParts(output, { run });
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
