import { environmentMs } from '#script-flags';
import { summaryLine } from '#check-cache';
import { failedTestFiles } from '../../../lib/flaky-record.mjs';
import { BASE_COMPARE_TIMEOUT_MS, DEFAULT_BASE } from './gate-constants.mjs';
import { failReason, outputTail, failLines } from './gate-command.mjs';
import { preexistingFailureFiles } from './base-compare.mjs';
import { unlandedBlame } from './task-states.mjs';

export async function failedCriterionLines(gateRun, { plan, landed, root, base }) {
  const reason = gateRun.ok ? summaryLine(gateRun.output) : failReason(gateRun);
  if (gateRun.timedOutMs !== undefined) return { lines: failLines('success-criterion', reason, gateRun.output), failed: true };
  const blamed = unlandedBlame(plan.tasks, landed, gateRun.output);
  if (blamed.length > 0) {
    return { lines: [`SKIP success-criterion (out of scope: ${reason} names only files of unlanded Task ${blamed.join(', ')})`, ...outputTail(gateRun.output)], failed: false };
  }
  const ref = base ?? DEFAULT_BASE;
  const timeoutMs = environmentMs('EXO_BASE_COMPARE_TIMEOUT_MS', BASE_COMPARE_TIMEOUT_MS);
  const preexisting = await preexistingFailureFiles({ root, base: ref, output: gateRun.output, timeoutMs, failedFiles: failedTestFiles });
  if (preexisting.length > 0) return { lines: [`SKIP success-criterion (also fails on base: ${preexisting.join(', ')}; ${reason} on ${ref})`, ...outputTail(gateRun.output)], failed: false };
  return { lines: failLines('success-criterion', reason, gateRun.output), failed: true };
}
