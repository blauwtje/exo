import { failingLine } from '#attempt-fingerprint';
import { clip } from './run-report.mjs';
import { landByScript, landInOrder, markLanded } from './run-plan-landing.mjs';
import { repairOrBlock } from './run-plan-repair.mjs';

function redInputsOf(ctx, n) {
  const { proof, runs, red } = ctx.plan.tasks.find((entry) => entry.number === n);
  return JSON.stringify([proof, runs, red]);
}

export async function repairThenLand(ctx, n, reason, landing) {
  const inputsBefore = redInputsOf(ctx, n);
  const stopped = await repairOrBlock(ctx, n, reason);
  if (stopped !== undefined) return stopped;
  if (reason.includes('no red proof') && redInputsOf(ctx, n) === inputsBefore) {
    ctx.say(`task ${n} land check skipped: the repair left Proof and Red unchanged`);
    return undefined;
  }
  const rechecked = landByScript(ctx, n);
  if (!rechecked.landed) {
    ctx.say(`task ${n} not landed by the script: ${clip(failingLine(rechecked.output), 80)}`);
    return stopped;
  }
  markLanded(ctx, n, landing.record, landing.started);
  return undefined;
}

export async function landOrRepair(ctx, numbers, record, started) {
  const refused = landInOrder(ctx, numbers, record, started);
  if (refused === undefined) return undefined;
  const stopped = await repairThenLand(ctx, refused.n, refused.reason, { record, started });
  if (stopped !== undefined || !ctx.passes.has(refused.n)) return stopped;
  return landOrRepair(ctx, numbers.slice(numbers.indexOf(refused.n) + 1), record, started);
}
