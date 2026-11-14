import process from 'node:process';
import { landRun } from './land-run.mjs';
import { planFrame } from './plan-file.mjs';
import { readState, runDir } from './run-state.mjs';

export function landStage(root, id, plan) {
  const state = readState(root, id);
  const frame = planFrame(plan);
  const result = landRun({
    root, runRoot: state.runRoot ?? root, branch: state.branch ?? frame.branch, mode: frame.land, commit: frame.commit ?? '', runDir: runDir(root, id),
    success: frame.successCriterion ?? ''
  });
  process.stdout.write(`exo: ${result.phase === 'landed' ? `landed ${result.range ?? ''} ${result.prUrl ?? ''}`.trim() : `parked: ${result.gate}; exo approve ${id}`}\n`);
  return result;
}
