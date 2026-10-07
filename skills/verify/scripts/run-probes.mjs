// Reruns the probes of the fix findings the fix-review agent marked `fixed`.
// A probe is the command on the `Probe:` line under a finding in the branch
// review's report; it failed before the fix and must exit 0 after it. Prints
// one PASS or FAIL line per fixed finding and exits 1 on any FAIL, so
// verify ends the turn with the fixes uncommitted, as it does for a gate FAIL.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';

const PROBE_LINE = /^\s*Probe:\s*(.*)$/;
const FIXED_FINDING = /\bfixed\s*$/;
const PROBE_TIMEOUT_MS = 60_000;
const TAIL_LINES = 10;

/** Each finding line of `report` ending `fixed`, with the command of the `Probe:` line under it, or null. */
export function fixedProbes(report) {
  const lines = report.split('\n');
  const probes = [];
  lines.forEach((line, index) => {
    if (PROBE_LINE.test(line) || !FIXED_FINDING.test(line)) return;
    const next = PROBE_LINE.exec(lines[index + 1] ?? '');
    probes.push({ finding: line.trim(), command: next?.[1].trim() || null });
  });
  return probes;
}

function runProbe(command, root) {
  const result = spawnSync('bash', ['-c', command], { cwd: root, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-TAIL_LINES).join('\n');
  return { passed: result.status === 0, output: result.error ? `${result.error.message}\n${output}` : output };
}

/** The report lines for every fixed finding's probe, and whether all passed. */
export function runProbes(report, root) {
  const lines = [];
  let allPassed = true;
  for (const { finding, command } of fixedProbes(report)) {
    if (command === null) {
      lines.push(`FAIL probe (no Probe line under a fixed finding): ${finding}`);
      allPassed = false;
      continue;
    }
    const { passed, output } = runProbe(command, root);
    lines.push(`${passed ? 'PASS' : 'FAIL'} probe (${command}): ${finding}`);
    if (!passed) {
      allPassed = false;
      if (output) lines.push(output);
    }
  }
  return { lines, allPassed };
}

function main(argv) {
  const { report, root } = parseFlags(argv, { report: 'string', root: 'string' });
  if (!report || !root) throw new UsageError('--report and --root are required');
  const { lines, allPassed } = runProbes(fs.readFileSync(report, 'utf8'), root);
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = allPassed ? 0 : 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`run-probes: ${error.message}\n`);
    process.exitCode = 2;
  }
}
