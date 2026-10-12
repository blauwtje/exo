import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';

const PROBE_LINE = /^\s*Probe:\s*(.*)$/;
const FIXED_FINDING = /\bfixed\s*$/;
const PROBE_TIMEOUT_MS = 60_000;
const TAIL_LINES = 10;
const USAGE = `Usage: node run-probes.mjs --report <file> --root <dir>
Reruns the Probe: command under each finding marked fixed; prints PASS or FAIL per finding, exits 1 on any FAIL.`;

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
