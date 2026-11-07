import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { planIdOf } from '#plan-landed';
import { PinError, RefusedError } from './land-errors.mjs';
import { mcpProofOf } from './land-report.mjs';

export function parsePin(value) {
  if (value === undefined) return null;
  const match = value.match(/^([^/\s]+)\/(\d+)$/);
  if (match === null) throw new RefusedError(`EXO_RUN_TASK '${value}' is not <plan-id>/<task number>`);
  return { planId: match[1], number: Number(match[2]) };
}

export function refuseOutsidePin(pin, planPath, number) {
  if (pin === null) return;
  if (pin.planId !== planIdOf(planPath) || pin.number !== number) {
    throw new PinError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

export function refuseOtherPlan(pin, planPath, number) {
  if (pin !== null && pin.planId !== planIdOf(planPath)) {
    throw new PinError(`EXO_RUN_TASK pins this run to ${pin.planId}/${pin.number}; Task ${number} of ${planIdOf(planPath)} is refused`);
  }
}

export function refuseMcpProofUnderPin(pin, task) {
  if (pin !== null && mcpProofOf(task) !== null) {
    throw new RefusedError(`EXO_RUN_TASK refuses Task ${task.number}: its Proof is an MCP call, which only an interactive session can run`);
  }
}

export function refuseMismatchedToplevel(root) {
  const resolvedRoot = realpathSync(root);
  const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const resolvedToplevel = realpathSync(toplevel);
  if (resolvedToplevel !== resolvedRoot) {
    throw new RefusedError(`--root '${root}' is not the checkout toplevel: git rev-parse --show-toplevel there prints '${toplevel}'`);
  }
}
