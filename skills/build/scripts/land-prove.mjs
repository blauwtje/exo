import { UsageError } from '#script-flags';
import { commitBlockOf } from './land-commit-block.mjs';
import { refuseMcpProofUnderPin } from './land-pin.mjs';
import { refuseBadCommitText, refuseBadEvidence } from './land-fix.mjs';
import { runProof, runNamedTests } from './land-proof.mjs';
import { siblingWorkOf, unplannedPaths } from './land-paths.mjs';
import { signatureChanges } from './land-signatures.mjs';
import { runLint, runCodeRules } from './land-code-rules.mjs';
import { redGreenLine, refuseTogether, passingRunsOf, checkReport } from './land-refusals.mjs';

export function taskOf(plan, number) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  return task;
}

export function refuseBeforeProof(plan, task, { root, planPath, pin, planId, reportText, reportPath }) {
  refuseMcpProofUnderPin(pin, task);
  const siblingWork = siblingWorkOf(plan, task, { root, planPath, landing: true });
  const warning = refuseTogether(task, { root, planPath, siblingWork, reportText, reportPath });
  const outside = unplannedPaths(task, { root, planPath, siblingWork });
  const block = commitBlockOf(plan, task.number, planId, signatureChanges(task, root), root);
  refuseBadCommitText(task.commitSubject ?? task.title, block);
  if (task.evidence != null) refuseBadEvidence(`Evidence: ${task.evidence}`);
  return { block, warning, outside };
}

export function proveTask(task, { root, planPath, docker, reportText, reportPath, pendingEvidence }) {
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proofCommands = proofCommand === null ? passingRunsOf(task) : [proofCommand];
  const proofs = proofCommands.map((command) => runProof(task, command, { root, field: task.compact ? 'Proof' : 'Run', docker, pendingEvidence }));
  runNamedTests(task, proofCommands, { root, planPath, pendingEvidence });
  const { line, warning } = redGreenLine(task, proofCommands, root, pending);
  return { proofs, pending, redLine: line, warning };
}

export function runPreCommitGates(task, frame, root) {
  const files = task.files.map((file) => file.path);
  runLint(frame.lint, files, root);
  return runCodeRules(files, root);
}
