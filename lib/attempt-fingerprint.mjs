import { createHash } from 'node:crypto';

// why: copied from skills/gate/scripts/gate.mjs, which does not export it.
const FAIL_REPORT_LINE = /^\s*(?:fail\b|not ok\b|✖|✗|×)/i;
const LAND_FAILURE_LINE = /^(?:land-task: |PLAN DRIFT: )/;
const FULL_OUTPUT_LINE = /^Full output:/;

const linesOf = (output) => String(output).split('\n');

export function failureLine(output) {
  return linesOf(output).find((line) => FAIL_REPORT_LINE.test(line) || LAND_FAILURE_LINE.test(line)) ?? '';
}

export function failingLine(output) {
  const failure = failureLine(output);
  if (failure !== '') return failure;
  const kept = linesOf(output).filter((line) => line.trim() !== '' && !FULL_OUTPUT_LINE.test(line.trim()));
  return kept.at(-1) ?? '';
}

export function attemptFingerprint({ check, line, paths }) {
  const text = JSON.stringify([check, line, [...paths].sort()]);
  return createHash('sha256').update(text).digest('hex');
}
