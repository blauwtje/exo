import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { fixerMark } from '#fixer-mark';
import { appendLedger, latestRound, parseFinding } from './merge-reviews.mjs';

const PROBE_LINE = /^\s*Probe:\s*(.*)$/;
const SWEEP_LINE = /^\s*Sweep:\s*(.*)$/;
const PROBE_TIMEOUT_MS = 60_000;
const TAIL_LINES = 10;
const USAGE = `Usage: node run-probes.mjs --report <file> --root <dir>
Reruns the Probe: command and the Sweep: command under each finding marked fixed; a Sweep that prints anything fails. Prints PASS or FAIL per finding.
A finding with a Probe: line under it marked neither fixed nor reported: <reason> prints FAIL probe (unmarked finding); a fixed finding with no Probe: line under it prints FAIL probe (no Probe line). Exits 1 on any FAIL.`;

export function fixedProbes(report) {
  const lines = report.split('\n');
  const probes = [];
  lines.forEach((line, index) => {
    if (PROBE_LINE.test(line)) return;
    const next = PROBE_LINE.exec(lines[index + 1] ?? '');
    const mark = fixerMark(line);
    if (mark?.state === 'fixed') probes.push({ finding: line.trim(), command: next?.[1].trim() || null, sweep: SWEEP_LINE.exec(lines[index + 3] ?? '')?.[1].trim() || null });
    else if (next && mark === null) probes.push({ finding: line.trim(), command: null, unmarked: true });
  });
  return probes;
}

function runProbe(command, root, { sweep = false } = {}) {
  const result = spawnSync('bash', ['-c', command], { cwd: root, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-TAIL_LINES).join('\n');
  const passed = sweep ? output === '' && !result.error : result.status === 0;
  return { passed, output: result.error ? `${result.error.message}\n${output}` : output };
}

function ledgerFixed(finding, root) {
  const parsed = parseFinding(finding);
  if (parsed !== null) appendLedger(root, [{ ...parsed, state: 'fixed' }], latestRound(root));
}

export function runProbes(report, root) {
  const lines = [];
  let allPassed = true;
  for (const { finding, command, sweep, unmarked } of fixedProbes(report)) {
    if (command === null) {
      lines.push(`FAIL probe (${unmarked ? 'unmarked finding: append fixed or reported: <reason>' : 'no Probe line under a fixed finding: add its Probe: line, or mark reported: <reason> when no commit repaired it'}): ${finding}`);
      allPassed = false;
      continue;
    }
    const probe = runProbe(command, root);
    lines.push(`${probe.passed ? 'PASS' : 'FAIL'} probe (${command}): ${finding}`);
    const swept = probe.passed && sweep !== null ? runProbe(sweep, root, { sweep: true }) : null;
    if (swept !== null) lines.push(`${swept.passed ? 'PASS' : 'FAIL'} probe (sweep ${sweep}): ${finding}`);
    const failed = [probe, swept].filter((result) => result !== null && !result.passed);
    if (failed.length === 0) ledgerFixed(finding, root);
    for (const { output } of failed) if (output) lines.push(output);
    if (failed.length > 0) allPassed = false;
  }
  return { lines, allPassed };
}

function main(argv) {
  const { report, root } = parseFlags(argv, { report: 'string', root: 'string' }, { usage: USAGE });
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
