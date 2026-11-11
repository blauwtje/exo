import { appendStep, readJournal, resumePoint } from '../../build/scripts/run-state.mjs';
import { workingTreeKey } from '#check-cache';

export const GATE_RUN_ID = 'gate';

export function noteGateStep(root, step, tree = workingTreeKey(root)) {
  appendStep(root, GATE_RUN_ID, { kind: 'gate-step', step, tree });
}

export function passedOnTree(root, step, tree = workingTreeKey(root)) {
  return resumePoint(readJournal(root, GATE_RUN_ID)).gateSteps.get(step) === tree;
}
