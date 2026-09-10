// Port of Test-SkillScriptBehavior (verify.ps1:1406-1438): runs tests/*.test.mjs
// under node --test with the TAP reporter and reports the tally. The tally comes
// from the TAP footer rather than the exit code alone, so a green line names how
// many tests actually ran and a red one names which ones failed.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const TALLY_KEYS = ['tests', 'pass', 'fail', 'skipped'];

// The TAP footer prints each count once, but a nested reporter can repeat a key,
// so the last occurrence is the run's own total. A key that never appears is -1,
// which shows up in the detail rather than passing as a zero.
function tallyFrom(lines, key) {
  const pattern = new RegExp(`^#\\s+${key}\\s+(\\d+)\\s*$`);
  let value = -1;
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) value = Number(match[1]);
  }
  return value;
}

export function checkSkillScriptBehavior(report, repository) {
  const testsRoot = repository.join('tests');
  if (!(fs.existsSync(testsRoot) && fs.statSync(testsRoot).isDirectory())) {
    report.result('UNRUN', 'skill script behavior', 'this repository copy has no tests/ folder');
    return;
  }
  const testFiles = fs.readdirSync(testsRoot).sort()
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join(testsRoot, name))
    .filter((file) => fs.statSync(file).isFile());
  if (testFiles.length === 0) {
    report.result('UNRUN', 'skill script behavior', 'tests/ holds no *.test.mjs file');
    return;
  }

  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], {
    encoding: 'utf8'
  });
  const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n');
  const tally = Object.fromEntries(TALLY_KEYS.map((key) => [key, tallyFrom(lines, key)]));
  const summary = `${tally.pass} passed, ${tally.fail} failed, ${tally.skipped} skipped of ${tally.tests} behavioral tests`;

  if (run.status !== 0) {
    const failing = lines.filter((line) => line.startsWith('not ok '));
    report.result('FAIL', 'skill script behavior', `${summary}; ${failing.join('; ')}`);
    return;
  }
  report.result('PASS', 'skill script behavior', summary);
}
