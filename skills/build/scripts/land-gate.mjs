import { runTreeSync } from '#process-tree';
import { environmentMs } from '#script-flags';
import { landedTasks } from '#plan-tasks';
import { cachedPass, lastPassMs, recordPass, SLOW_GATE_MS, workingTreeKey } from '#check-cache';
import { LandingError } from './land-errors.mjs';
import { dropsOf } from './land-commit-block.mjs';
import { PROOF_TIMEOUT_MS } from './land-report.mjs';

const GATE_VARIABLES = ['EXO_DROPS', 'EXO_PENDING_EVIDENCE'];

function setGateEnv(values) {
  const outer = Object.fromEntries(GATE_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of GATE_VARIABLES) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  return () => {
    for (const name of GATE_VARIABLES) {
      if (outer[name] === undefined) delete process.env[name];
      else process.env[name] = outer[name];
    }
  };
}

function unlandedEvidenceOf(plan, root, planId, skip) {
  const landed = landedTasks(plan.tasks, root, planId);
  const values = plan.tasks
    .filter((other) => other.number !== skip?.number && !landed.includes(other.number) && other.evidence !== null)
    .map((other) => other.evidence);
  return values.length === 0 ? undefined : values.join('\n');
}

function pendingEvidenceOf(plan, task, root, planId) {
  return unlandedEvidenceOf(plan, root, planId, task);
}

export function proofEvidenceOf(plan, root, planId) {
  return unlandedEvidenceOf(plan, root, planId, null);
}

export function gateEnvOf(plan, task, root, planId) {
  return { EXO_DROPS: dropsOf(task) ?? undefined, EXO_PENDING_EVIDENCE: pendingEvidenceOf(plan, task, root, planId) };
}

export function runLandGate(landGate, root, gateEnv = {}) {
  if (landGate === null || landGate === 'none') return null;
  if (cachedPass(root, landGate) !== null) return `Land gate "${landGate}" skipped: it already passed on this tree.\n`;
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= SLOW_GATE_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so gate runs it once.\n`;
  }
  const before = workingTreeKey(root);
  const started = Date.now();
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const restore = setGateEnv(gateEnv);
  let gate;
  try {
    gate = runTreeSync(landGate, { cwd: root, timeoutMs: deadlineMs });
  } finally {
    restore();
  }
  if (gate.status !== 0 || gate.timedOut) {
    const timedOut = gate.timedOut ? `timed out after ${deadlineMs / 1000}s` : '';
    const output = `${gate.output}${timedOut || (gate.error?.message ?? '')}`.trim();
    throw new LandingError(`Land gate "${landGate}" failed:\n${output}`);
  }
  recordPass(root, landGate, Date.now() - started, before);
  return '';
}
