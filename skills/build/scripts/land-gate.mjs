import { runCheck } from '../../../lib/run-check.mjs';
import { environmentMs } from '#script-flags';
import { landedTasks } from '#plan-landed';
import { gateRefusal, lastPassMs, SLOW_GATE_MS } from '#check-cache';
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
  const last = lastPassMs(root, landGate);
  if (last !== null && last >= SLOW_GATE_MS) {
    return `Land gate "${landGate}" skipped: its last pass took ${last} ms, so gate runs it once.\n`;
  }
  const deadlineMs = environmentMs('EXO_LAND_GATE_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const restore = setGateEnv(gateEnv);
  let gate;
  try {
    gate = runCheck(root, landGate, { timeoutMs: deadlineMs });
  } finally {
    restore();
  }
  if (gate.cached) return `Land gate "${landGate}" skipped: its log shows a clean pass on this tree.\n`;
  if (gate.timedOut) throw new LandingError(`Land gate "${landGate}" failed:\n${`${gate.output}timed out after ${deadlineMs / 1000}s`.trim()}`);
  if (gate.code !== 0) throw new LandingError(`Land gate "${landGate}" failed:\n${gate.output.trim()}`);
  if (!gate.ok) throw new LandingError(`Land gate "${landGate}" exited 0 but ${gateRefusal(landGate, gate.output)}:\n${gate.output.trim()}`);
  return '';
}
