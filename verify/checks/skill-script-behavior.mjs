// Runs tests/*.test.mjs under node --test with the TAP reporter and reports the
// tally. The tally comes from the TAP footer rather than the exit code alone, so
// a green line names how many tests actually ran and a red one names which ones
// failed.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

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

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve({ status: null, output: stdout + stderr }));
    child.on('close', (status) => resolve({ status, output: stdout + stderr }));
  });
}

const NAME = 'skill script behavior';

function outcomeOf(run) {
  const lines = run.output.split('\n');
  const tally = Object.fromEntries(TALLY_KEYS.map((key) => [key, tallyFrom(lines, key)]));
  const summary = `${tally.pass} passed, ${tally.fail} failed, ${tally.skipped} skipped of ${tally.tests} behavioral tests`;

  if (run.status !== 0) {
    const failing = lines.filter((line) => line.startsWith('not ok '));
    return { status: 'FAIL', name: NAME, detail: `${summary}; ${failing.join('; ')}` };
  }
  return { status: 'PASS', name: NAME, detail: summary };
}

export function startSkillScriptBehavior(repository) {
  const testsRoot = repository.join('tests');
  if (!(fs.existsSync(testsRoot) && fs.statSync(testsRoot).isDirectory())) {
    return Promise.resolve({ status: 'UNRUN', name: NAME, detail: 'this repository copy has no tests/ folder' });
  }
  const testFiles = fs.readdirSync(testsRoot).sort()
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join(testsRoot, name))
    .filter((file) => fs.statSync(file).isFile());
  if (testFiles.length === 0) {
    return Promise.resolve({ status: 'UNRUN', name: NAME, detail: 'tests/ holds no *.test.mjs file' });
  }

  // why: the check can run inside `exo run`, whose variables would make the tests park gates in the live run.
  const stripFile = repository.join('tests', 'clean-run-env.mjs');
  const strip = fs.existsSync(stripFile) ? ['--import', pathToFileURL(stripFile).href] : [];
  return runNode([...strip, '--test', '--test-reporter=tap', ...testFiles]).then(outcomeOf);
}
