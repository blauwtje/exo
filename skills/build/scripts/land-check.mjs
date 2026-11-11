import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '#script-flags';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { planIdOf } from '#plan-landed';
import { SCRATCH_FOLDER } from '#scratch-path';
import { LandingError } from './land-errors.mjs';
import { reportSourceOf } from './land-stopped.mjs';
import { locked } from './land-git.mjs';
import { commitBlockOf } from './land-commit-block.mjs';
import { refuseOtherPlan, refuseMcpProofUnderPin, refuseMismatchedToplevel } from './land-pin.mjs';
import { siblingWorkOf } from './land-paths.mjs';
import { signatureChanges } from './land-signatures.mjs';
import { runCodeRules } from './land-code-rules.mjs';
import { gateEnvOf } from './land-gate.mjs';
import { refuseTogether } from './land-refusals.mjs';
import { runPreCommitGates } from './land-prove.mjs';
import { dropCandidate, clearStaleCandidate, commitCandidate, gateCandidate } from './land-candidate.mjs';

export function checkTask({ planText, number, root, reportText = null, reportPath = null, planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  refuseMismatchedToplevel(root);
  return locked(root, () => checkTaskLocked({ planText, number, root, ...reportSourceOf({ root, number, reportText, reportPath }), planPath, pin }));
}

function checkTaskLocked({ planText, number, root, reportText, reportPath, planPath, pin }) {
  const plan = parsePlan(planText);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  const planId = planIdOf(planPath);
  clearStaleCandidate(root, planId);
  clearCheckStamp(root, number);
  refuseMcpProofUnderPin(pin, task);
  refuseTogether(task, { root, planPath, siblingWork: siblingWorkOf(plan, task, { root, planPath, landing: false }), reportText, reportPath });
  const frame = frameOf(plan.frame);
  const warnLines = runPreCommitGates(task, frame, root);
  const gateLine = warnLines + gateCheckedOnCandidate(plan, task, frame, { root, planId });
  const report = `Report OK: Task ${number}\n`;
  writeCheckStamp(root, number, report);
  return `${gateLine}${report}`;
}

function gateCheckedOnCandidate(plan, task, frame, { root, planId }) {
  if (frame.landGate === null || frame.landGate === 'none') return '';
  const candidate = commitCandidate(commitBlockOf(plan, task.number, planId, signatureChanges(task, root), root), root, task, planId);
  const gateLine = gateCandidate(frame, root, gateEnvOf(plan, task, root, planId), candidate);
  if (!dropCandidate(root, candidate)) throw new LandingError(`HEAD moved off the candidate ${candidate.candidate.slice(0, 7)} of Task ${task.number} while the Land gate ran; nothing was rewritten`);
  return gateLine;
}

function checkStampPath(root, number) {
  return path.join(root, SCRATCH_FOLDER, `checked-${number}`);
}

function clearCheckStamp(root, number) {
  fs.rmSync(checkStampPath(root, number), { force: true });
}

function writeCheckStamp(root, number, report) {
  const stamp = checkStampPath(root, number);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, report);
}


export function checkCodeRules({ planText, number, root, planPath, pin = null }) {
  refuseOtherPlan(pin, planPath, number);
  const task = parsePlan(planText).tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return `${runCodeRules(task.files.map((file) => file.path), root)}Code rules OK: Task ${number}\n`;
}
